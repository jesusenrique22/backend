import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { sanitizeUser } from '../utils/sanitizeUser';
import { UserRole } from '../types/enums';
import { doctorProfileInclude, mapDoctorProfile } from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';

export const listUsers = async (req: import('../middleware/auth').AuthRequest, res: Response) => {
  const where: { role?: string } = {};
  if (req.query.role) where.role = String(req.query.role);

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  res.json(users.map(sanitizeUser));
};

export const getStats = async (_req: import('../middleware/auth').AuthRequest, res: Response) => {
  const [patients, doctors, admins, appointments, facilities, specialties] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.PATIENT } }),
    prisma.user.count({ where: { role: UserRole.DOCTOR } }),
    prisma.user.count({ where: { role: UserRole.ADMIN } }),
    prisma.appointment.count(),
    prisma.medicalFacility.count({ where: { isActive: true } }),
    prisma.specialty.count(),
  ]);

  res.json({ patients, doctors, admins, appointments, facilities, specialties });
};

export const createFacility = async (req: import('../middleware/auth').AuthRequest, res: Response) => {
  const facility = await prisma.medicalFacility.create({ data: req.body });
  res.status(201).json(toApiDoc(facility));
};

export const createSpecialty = async (req: import('../middleware/auth').AuthRequest, res: Response) => {
  const specialty = await prisma.specialty.create({ data: req.body });
  res.status(201).json(toApiDoc(specialty));
};

export const listDoctors = async (_req: import('../middleware/auth').AuthRequest, res: Response) => {
  const profiles = await prisma.doctorProfile.findMany({
    include: doctorProfileInclude,
    orderBy: { createdAt: 'desc' },
  });

  const userIds = profiles.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, role: UserRole.DOCTOR },
  });
  const usersSafe = users.map((u) => toApiDoc(omitPassword(u)));

  res.json(
    profiles.map((profile) => ({
      profile: mapDoctorProfile(profile),
      user: usersSafe.find((u) => u.id === profile.userId) ?? null,
    })),
  );
};
