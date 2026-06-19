import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import { sanitizeUser } from '../utils/sanitizeUser';

export function generateTemporaryPassword(): string {
  return crypto.randomBytes(4).toString('hex') + 'A1!';
}

export interface CreateStaffUserInput {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  createdBy: string;
  managedFacilityId?: string;
  pharmacyId?: string;
  laboratoryId?: string;
}

export async function createStaffUser(input: CreateStaffUserInput) {
  const emailNorm = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (existing) {
    throw new Error('El correo ya está registrado');
  }

  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

  const user = await prisma.user.create({
    data: {
      email: emailNorm,
      password: hashedPassword,
      name: input.name.trim(),
      role: input.role,
      phone: input.phone?.trim(),
      managedFacilityId: input.managedFacilityId,
      pharmacyId: input.pharmacyId,
      laboratoryId: input.laboratoryId,
      createdById: input.createdBy,
      isActive: true,
    },
  });

  return {
    user: sanitizeUser(user),
    temporaryPassword,
  };
}
