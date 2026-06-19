import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import { omitPassword, toApiDoc } from '../utils/apiDoc';

export const AMBULANCE_CREW_ROLES = [
  UserRole.AMBULANCE_DRIVER,
  UserRole.PARAMEDIC,
  UserRole.AMBULANCE_NURSE,
] as const;

export type AmbulanceCrewRole = (typeof AMBULANCE_CREW_ROLES)[number];

export function isAmbulanceCrewRole(role: string): role is AmbulanceCrewRole {
  return (AMBULANCE_CREW_ROLES as readonly string[]).includes(role);
}

async function findAssignedUnit(userId: string) {
  return prisma.ambulanceUnit.findFirst({
    where: {
      isActive: true,
      OR: [{ driverId: userId }, { paramedicId: userId }, { nurseId: userId }],
    },
    include: {
      facility: { select: { id: true, name: true, address: true } },
      driver: { select: { id: true, name: true } },
      paramedic: { select: { id: true, name: true } },
      nurse: { select: { id: true, name: true } },
    },
  });
}

export async function ensureAmbulanceStaffProfile(userId: string) {
  const existing = await prisma.ambulanceStaffProfile.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  return prisma.ambulanceStaffProfile.create({ data: { userId } });
}

function mapStaffProfile(profile: {
  licenseNumber: string | null;
  certification: string | null;
  bio: string | null;
}) {
  return {
    licenseNumber: profile.licenseNumber,
    certification: profile.certification,
    bio: profile.bio,
  };
}

function mapAssignedUnit(
  unit: NonNullable<Awaited<ReturnType<typeof findAssignedUnit>>>,
  userId: string,
) {
  const crewRole =
    unit.driverId === userId
      ? 'DRIVER'
      : unit.paramedicId === userId
        ? 'PARAMEDIC'
        : 'NURSE';

  return {
    id: unit.id,
    plateNumber: unit.plateNumber,
    callSign: unit.callSign,
    status: unit.status,
    crewRole,
    facility: unit.facility
      ? {
          id: unit.facility.id,
          name: unit.facility.name,
          address: unit.facility.address,
        }
      : null,
    driverName: unit.driver?.name ?? null,
    paramedicName: unit.paramedic?.name ?? null,
    nurseName: unit.nurse?.name ?? null,
  };
}

export async function getAmbulanceCrewProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !isAmbulanceCrewRole(user.role)) {
    throw new Error('Perfil no encontrado');
  }

  const profile = await ensureAmbulanceStaffProfile(userId);
  const unit = await findAssignedUnit(userId);

  return {
    user: toApiDoc(omitPassword(user)),
    profile: mapStaffProfile(profile),
    assignedUnit: unit ? mapAssignedUnit(unit, userId) : null,
  };
}

export async function updateAmbulanceCrewProfile(
  userId: string,
  input: {
    name?: string;
    phone?: string;
    profilePic?: string;
    licenseNumber?: string | null;
    certification?: string | null;
    bio?: string | null;
  },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !isAmbulanceCrewRole(user.role)) {
    throw new Error('Perfil no encontrado');
  }

  await ensureAmbulanceStaffProfile(userId);

  const userData: { name?: string; phone?: string | null; profilePic?: string | null } = {};
  if (input.name !== undefined) userData.name = input.name.trim();
  if (input.phone !== undefined) userData.phone = input.phone?.trim() || null;
  if (input.profilePic !== undefined) userData.profilePic = input.profilePic?.trim() || null;

  const profileData: {
    licenseNumber?: string | null;
    certification?: string | null;
    bio?: string | null;
  } = {};
  if (input.licenseNumber !== undefined) {
    profileData.licenseNumber = input.licenseNumber?.trim() || null;
  }
  if (input.certification !== undefined) {
    profileData.certification = input.certification?.trim() || null;
  }
  if (input.bio !== undefined) profileData.bio = input.bio?.trim() || null;

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: userData }),
    prisma.ambulanceStaffProfile.update({
      where: { userId },
      data: profileData,
    }),
  ]);

  return getAmbulanceCrewProfile(userId);
}

export async function changeAmbulanceCrewPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (String(newPassword).length < 6) {
    throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !isAmbulanceCrewRole(user.role)) {
    throw new Error('Usuario no encontrado');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new Error('La contraseña actual no es correcta');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(String(newPassword), 10) },
  });

  return { message: 'Contraseña actualizada correctamente' };
}
