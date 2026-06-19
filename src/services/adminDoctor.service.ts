import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import { sanitizeUser } from '../utils/sanitizeUser';
import { doctorProfileInclude, mapDoctorProfile } from '../utils/prismaMappers';

export interface CreateDoctorInput {
  name: string;
  email: string;
  phone: string;
  documentId: string;
  specialtyId: string;
  facilityIds: string[];
  allowedFacilityIds?: string[];
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(4).toString('hex') + 'A1!';
}

export async function createDoctorByAdmin(input: CreateDoctorInput) {
  const { name, email, phone, documentId, specialtyId, facilityIds } = input;

  const emailNorm = email.toLowerCase().trim();
  const docNorm = documentId.trim().toUpperCase();

  const existingUser = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (existingUser) {
    throw new Error('El correo ya está registrado');
  }

  const existingDoc = await prisma.doctorProfile.findUnique({ where: { documentId: docNorm } });
  if (existingDoc) {
    throw new Error('La cédula ya está asociada a otro médico');
  }

  const specialty = await prisma.specialty.findUnique({ where: { id: specialtyId } });
  if (!specialty) {
    throw new Error('Especialidad no encontrada');
  }

  if (!facilityIds.length) {
    throw new Error('Selecciona al menos una clínica asociada');
  }

  const uniqueFacilityIds = [...new Set(facilityIds)];

  if (input.allowedFacilityIds?.length) {
    const allowed = new Set(input.allowedFacilityIds.map(String));
    const outOfScope = uniqueFacilityIds.filter((id) => !allowed.has(id));
    if (outOfScope.length) {
      throw new Error('Solo puedes asignar médicos a tu clínica autorizada');
    }
  }

  const facilities = await prisma.medicalFacility.findMany({
    where: {
      id: { in: uniqueFacilityIds },
      isActive: true,
      serviceEnabled: true,
    },
  });
  if (facilities.length !== uniqueFacilityIds.length) {
    throw new Error('Una o más clínicas no son válidas, están inactivas o sin servicio');
  }

  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

  const user = await prisma.user.create({
    data: {
      email: emailNorm,
      password: hashedPassword,
      name: name.trim(),
      role: UserRole.DOCTOR,
      phone: phone.trim(),
    },
  });

  const profile = await prisma.doctorProfile.create({
    data: {
      userId: user.id,
      documentId: docNorm,
      specialties: { create: [{ specialtyId }] },
      facilities: { create: uniqueFacilityIds.map((facilityId) => ({ facilityId })) },
      specialtyDurations: {
        create: { specialtyId, durationMinutes: 30 },
      },
    },
    include: doctorProfileInclude,
  });

  return {
    user: sanitizeUser(user),
    profile: mapDoctorProfile(profile),
    temporaryPassword,
  };
}
