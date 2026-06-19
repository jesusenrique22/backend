import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import { getPendingInvitationIdsForFacility } from './clinicInvitation.service';
import { doctorProfileInclude, mapDoctorProfile } from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';

export async function listDoctorsForFacility(facilityId: string) {
  const profiles = await prisma.doctorProfile.findMany({
    where: { facilities: { some: { facilityId } } },
    include: doctorProfileInclude,
  });

  const userIds = profiles.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, role: UserRole.DOCTOR },
  });
  const usersSafe = users.map((u) => toApiDoc(omitPassword(u)));

  return profiles.map((profile) => ({
    profile: mapDoctorProfile(profile),
    user: usersSafe.find((u) => u.id === profile.userId) ?? null,
  }));
}

export async function listDoctorsNotInFacility(facilityId: string, search?: string) {
  const pendingDoctorIds = new Set(await getPendingInvitationIdsForFacility(facilityId));

  let doctorUsers = await prisma.user.findMany({ where: { role: UserRole.DOCTOR } });

  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    doctorUsers = doctorUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone?.toLowerCase().includes(q) ?? false),
    );
  }

  const profiles = await prisma.doctorProfile.findMany({
    where: { userId: { in: doctorUsers.map((u) => u.id) } },
    include: doctorProfileInclude,
  });

  const profileByUserId = new Map(profiles.map((p) => [p.userId, mapDoctorProfile(p)]));
  const usersSafe = doctorUsers.map((u) => toApiDoc(omitPassword(u)));

  const rows: {
    profile: ReturnType<typeof mapDoctorProfile> | null;
    user: (typeof usersSafe)[number];
    canInvite: boolean;
    inviteBlockedReason?: string;
  }[] = [];

  for (const user of usersSafe) {
    const profile = profileByUserId.get(user.id) ?? null;

    if (!profile) {
      rows.push({
        profile: null,
        user,
        canInvite: false,
        inviteBlockedReason: 'Sin perfil médico (usa Registrar médico nuevo)',
      });
      continue;
    }

    const facilityIds = (profile.facilityIds as { _id: string }[]).map((f) => f._id);
    if (facilityIds.includes(facilityId)) {
      continue;
    }

    if (pendingDoctorIds.has(user.id)) {
      continue;
    }

    rows.push({ profile, user, canInvite: true });
  }

  rows.sort((a, b) => (a.user?.name ?? '').localeCompare(b.user?.name ?? '', 'es'));
  return rows;
}

export async function assignDoctorToFacility(doctorUserId: string, facilityId: string) {
  const user = await prisma.user.findFirst({
    where: { id: doctorUserId, role: UserRole.DOCTOR },
  });
  if (!user) throw new Error('Médico no encontrado');

  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new Error('Perfil de médico no encontrado');

  const existing = await prisma.doctorProfileFacility.findUnique({
    where: {
      doctorProfileId_facilityId: { doctorProfileId: profile.id, facilityId },
    },
  });
  if (existing) throw new Error('Este médico ya está vinculado a tu clínica');

  await prisma.doctorProfileFacility.create({
    data: { doctorProfileId: profile.id, facilityId },
  });

  const populated = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: doctorProfileInclude,
  });

  return { user: toApiDoc(omitPassword(user)), profile: mapDoctorProfile(populated) };
}

export async function removeDoctorFromFacility(
  doctorUserId: string,
  facilityId: string,
  options?: { deleteIfLastFacility?: boolean },
) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: { facilities: true },
  });
  if (!profile) throw new Error('Perfil de médico no encontrado');

  if (!profile.facilities.some((f) => f.facilityId === facilityId)) {
    throw new Error('El médico no está vinculado a esta clínica');
  }

  if (profile.facilities.length <= 1) {
    if (!options?.deleteIfLastFacility) {
      throw new Error(
        'Este médico solo pertenece a tu clínica. Confirma «Eliminar cuenta» para quitarlo del sistema.',
      );
    }

    const upcomingAppointments = await prisma.appointment.count({
      where: {
        doctorId: doctorUserId,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        dateTime: { gte: new Date() },
      },
    });
    if (upcomingAppointments > 0) {
      throw new Error('No se puede eliminar: el médico tiene citas futuras pendientes');
    }

    await prisma.$transaction([
      prisma.doctorWorkSchedule.deleteMany({ where: { doctorId: doctorUserId, facilityId } }),
      prisma.clinicInvitation.deleteMany({
        where: { doctorId: doctorUserId, facilityId },
      }),
      prisma.user.delete({ where: { id: doctorUserId } }),
    ]);

    return { action: 'deleted' as const, doctorUserId };
  }

  await prisma.$transaction([
    prisma.doctorProfileFacility.delete({
      where: {
        doctorProfileId_facilityId: { doctorProfileId: profile.id, facilityId },
      },
    }),
    prisma.doctorWorkSchedule.deleteMany({ where: { doctorId: doctorUserId, facilityId } }),
  ]);

  const populated = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: doctorProfileInclude,
  });

  return { action: 'unassigned' as const, profile: mapDoctorProfile(populated) };
}

/** @deprecated Usa removeDoctorFromFacility */
export async function unassignDoctorFromFacility(doctorUserId: string, facilityId: string) {
  const result = await removeDoctorFromFacility(doctorUserId, facilityId);
  if (result.action === 'deleted') {
    throw new Error(
      'Este médico solo pertenece a tu clínica. Confirma «Eliminar cuenta» para quitarlo del sistema.',
    );
  }
  return { profile: result.profile };
}
