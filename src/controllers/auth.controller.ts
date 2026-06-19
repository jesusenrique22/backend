import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import { sanitizeUser } from '../utils/sanitizeUser';
import { ensureProfilesForUser } from '../services/userProfile.service';

import { jwtSecret } from '../config/secrets';

const JWT_SECRET = jwtSecret();

async function createRoleProfile(
  userId: string,
  role: UserRole,
  data: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  },
) {
  if (role === UserRole.PATIENT) {
    await prisma.patientProfile.create({
      data: {
        userId,
        fullName: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
      },
    });
    await prisma.medicalHistory.create({
      data: { patientId: userId },
    });
  }
}

export const register = async (req: Request, res: Response) => {
  const {
    email,
    password,
    name,
    role,
    phone,
    address,
    emergencyContactName,
    emergencyContactPhone,
  } = req.body;

  if (role !== UserRole.PATIENT) {
    return res.status(403).json({
      error: 'Solo los pacientes pueden crear cuenta pública. El personal es registrado por un administrador.',
    });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(400).json({ error: 'El correo ya está registrado' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role,
        phone,
      },
    });

    await createRoleProfile(user.id, role, {
      name,
      email: user.email,
      phone,
      address,
      emergencyContactName,
      emergencyContactPhone,
    });

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        managedFacilityId: user.managedFacilityId,
        pharmacyId: user.pharmacyId,
        laboratoryId: user.laboratoryId,
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.status(201).json({ user: sanitizeUser(user), token });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Error al registrar usuario' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Credenciales inválidas' });

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Cuenta deshabilitada. Contacta al administrador.' });
    }

    await ensureProfilesForUser(user);

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        managedFacilityId: user.managedFacilityId,
        pharmacyId: user.pharmacyId,
        laboratoryId: user.laboratoryId,
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.status(200).json({ user: sanitizeUser(user), token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export const me = async (req: Request, res: Response) => {
  const authReq = req as import('../middleware/auth').AuthRequest;
  try {
    const user = await prisma.user.findUnique({ where: { id: authReq.user?.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: sanitizeUser(user) });
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
};
