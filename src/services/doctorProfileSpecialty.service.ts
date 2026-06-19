import { prisma } from '../lib/prisma';
import {
  doctorProfileInclude,
  mapDoctorProfile,
} from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';

async function getDoctorProfileOrThrow(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new Error('Perfil de médico no encontrado');
  return profile;
}

async function loadMappedProfile(profileId: string) {
  const profile = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: doctorProfileInclude,
  });
  return mapDoctorProfile(profile);
}

export async function addSpecialtyToDoctorProfile(doctorUserId: string, specialtyId: string) {
  const specialty = await prisma.specialty.findUnique({ where: { id: specialtyId } });
  if (!specialty) throw new Error('Especialidad no encontrada');

  const profile = await getDoctorProfileOrThrow(doctorUserId);

  const existing = await prisma.doctorProfileSpecialty.findUnique({
    where: {
      doctorProfileId_specialtyId: { doctorProfileId: profile.id, specialtyId },
    },
  });
  if (existing) throw new Error('Ya tienes esta especialidad en tu perfil');

  await prisma.$transaction([
    prisma.doctorProfileSpecialty.create({
      data: { doctorProfileId: profile.id, specialtyId },
    }),
    prisma.doctorSpecialtyDuration.upsert({
      where: {
        doctorProfileId_specialtyId: { doctorProfileId: profile.id, specialtyId },
      },
      create: {
        doctorProfileId: profile.id,
        specialtyId,
        durationMinutes: profile.defaultConsultationMinutes ?? 30,
      },
      update: {},
    }),
  ]);

  return loadMappedProfile(profile.id);
}

export async function createSpecialtyAndAddToDoctorProfile(
  doctorUserId: string,
  rawName: string,
) {
  const name = rawName.trim();
  if (name.length < 2) {
    throw new Error('El nombre de la especialidad debe tener al menos 2 caracteres');
  }
  if (name.length > 80) {
    throw new Error('El nombre de la especialidad es demasiado largo');
  }

  let specialty = await prisma.specialty.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (!specialty) {
    try {
      specialty = await prisma.specialty.create({ data: { name } });
    } catch {
      specialty = await prisma.specialty.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (!specialty) throw new Error('No se pudo registrar la especialidad');
    }
  }

  return addSpecialtyToDoctorProfile(doctorUserId, specialty.id);
}

export async function removeSpecialtyFromDoctorProfile(
  doctorUserId: string,
  specialtyId: string,
) {
  const profile = await getDoctorProfileOrThrow(doctorUserId);

  const count = await prisma.doctorProfileSpecialty.count({
    where: { doctorProfileId: profile.id },
  });
  if (count <= 1) {
    throw new Error('Debes mantener al menos una especialidad en tu perfil');
  }

  const link = await prisma.doctorProfileSpecialty.findUnique({
    where: {
      doctorProfileId_specialtyId: { doctorProfileId: profile.id, specialtyId },
    },
  });
  if (!link) throw new Error('Esta especialidad no está en tu perfil');

  await prisma.$transaction([
    prisma.doctorProfileSpecialty.delete({
      where: {
        doctorProfileId_specialtyId: { doctorProfileId: profile.id, specialtyId },
      },
    }),
    prisma.doctorSpecialtyDuration.deleteMany({
      where: { doctorProfileId: profile.id, specialtyId },
    }),
  ]);

  return loadMappedProfile(profile.id);
}

export async function updateSpecialtyConsultationDuration(
  doctorUserId: string,
  specialtyId: string,
  durationMinutes: number,
) {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 120) {
    throw new Error('La duración debe estar entre 15 y 120 minutos');
  }

  const profile = await getDoctorProfileOrThrow(doctorUserId);

  const link = await prisma.doctorProfileSpecialty.findUnique({
    where: {
      doctorProfileId_specialtyId: { doctorProfileId: profile.id, specialtyId },
    },
  });
  if (!link) throw new Error('Esta especialidad no está en tu perfil');

  await prisma.doctorSpecialtyDuration.upsert({
    where: {
      doctorProfileId_specialtyId: { doctorProfileId: profile.id, specialtyId },
    },
    create: {
      doctorProfileId: profile.id,
      specialtyId,
      durationMinutes: Math.round(durationMinutes),
    },
    update: { durationMinutes: Math.round(durationMinutes) },
  });

  return loadMappedProfile(profile.id);
}

export async function updateDoctorProfileDetails(
  doctorUserId: string,
  input: {
    name?: string;
    bio?: string;
    licenseNumber?: string;
    profilePic?: string;
    defaultConsultationMinutes?: number;
  },
) {
  const user = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!user) throw new Error('Usuario no encontrado');

  const userData: { name?: string; profilePic?: string | null } = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (name.length < 2) throw new Error('El nombre debe tener al menos 2 caracteres');
    userData.name = name;
  }
  if (input.profilePic !== undefined) {
    userData.profilePic = String(input.profilePic).trim() || null;
  }
  if (Object.keys(userData).length > 0) {
    await prisma.user.update({ where: { id: doctorUserId }, data: userData });
  }

  const profile = await getDoctorProfileOrThrow(doctorUserId);
  const profileUpdate: {
    bio?: string;
    licenseNumber?: string;
    defaultConsultationMinutes?: number;
  } = {};

  if (input.bio !== undefined) {
    profileUpdate.bio = String(input.bio).trim().slice(0, 600);
  }
  if (input.licenseNumber !== undefined) {
    profileUpdate.licenseNumber = String(input.licenseNumber).trim().slice(0, 60);
  }
  if (input.defaultConsultationMinutes !== undefined) {
    const mins = Number(input.defaultConsultationMinutes);
    if (!Number.isFinite(mins) || mins < 15 || mins > 120) {
      throw new Error('La duración por defecto debe estar entre 15 y 120 minutos');
    }
    profileUpdate.defaultConsultationMinutes = Math.round(mins);
  }

  if (Object.keys(profileUpdate).length > 0) {
    await prisma.doctorProfile.update({ where: { id: profile.id }, data: profileUpdate });
  }

  const populated = await loadMappedProfile(profile.id);
  const userFresh = await prisma.user.findUnique({ where: { id: doctorUserId } });
  return {
    user: userFresh ? toApiDoc(omitPassword(userFresh)) : null,
    profile: populated,
  };
}
