import { prisma } from '../lib/prisma';
import { ClinicInvitationStatus } from '../models/ClinicInvitation';
import { UserRole } from '../types/enums';
import { emitToFacility, emitToUser } from '../socket/realtimeGatewayClient';
import { doctorProfileInclude, mapDoctorProfile } from '../utils/prismaMappers';

async function upsertClinicInvitationNotification(
  userId: string,
  relatedId: string,
  data: {
    title: string;
    message: string;
    type: string;
    relatedPath?: string;
    isRead: boolean;
  },
) {
  const existing = await prisma.notification.findFirst({
    where: { userId, category: 'CLINIC_INVITATION', relatedId },
  });
  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        message: data.message,
        type: data.type,
        relatedPath: data.relatedPath,
        isRead: data.isRead,
      },
    });
  } else {
    await prisma.notification.create({
      data: {
        userId,
        category: 'CLINIC_INVITATION',
        relatedId,
        title: data.title,
        message: data.message,
        type: data.type,
        relatedPath: data.relatedPath,
        isRead: data.isRead,
      },
    });
  }
}

export async function inviteDoctorToFacility(
  doctorUserId: string,
  facilityId: string,
  invitedByUserId: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: doctorUserId, role: UserRole.DOCTOR },
  });
  if (!user) throw new Error('Médico no encontrado');

  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: { facilities: true },
  });
  if (!profile) throw new Error('Perfil de médico no encontrado');

  const facility = await prisma.medicalFacility.findUnique({ where: { id: facilityId } });
  if (!facility) throw new Error('Clínica no encontrada');

  if (profile.facilities.some((f) => f.facilityId === facilityId)) {
    throw new Error('Este médico ya está vinculado a tu clínica');
  }

  const pending = await prisma.clinicInvitation.findFirst({
    where: { doctorId: doctorUserId, facilityId, status: ClinicInvitationStatus.PENDING },
  });
  if (pending) {
    throw new Error('Ya existe una invitación pendiente para este médico');
  }

  const invitation = await prisma.clinicInvitation.create({
    data: {
      doctorId: doctorUserId,
      facilityId,
      invitedByUserId,
      status: ClinicInvitationStatus.PENDING,
    },
  });

  const inviter = await prisma.user.findUnique({
    where: { id: invitedByUserId },
    select: { name: true },
  });
  const inviterName = inviter?.name ?? 'Administración de clínica';

  await upsertClinicInvitationNotification(doctorUserId, invitation.id, {
    title: 'Invitación a clínica',
    message: `${inviterName} te invita a unirte a ${facility.name}. Acepta o rechaza la solicitud.`,
    type: 'WARNING',
    relatedPath: '/clinic_invitation',
    isRead: false,
  });

  emitToUser(doctorUserId, 'notification:new', {
    category: 'CLINIC_INVITATION',
    title: 'Invitación a clínica',
    relatedId: invitation.id,
  });

  emitToFacility(facilityId, 'clinic:roster:updated', {
    reason: 'invitation_sent',
    facilityId,
    doctorUserId,
    doctorName: user.name,
  });

  return { invitation, facility, doctor: user };
}

export async function acceptClinicInvitation(invitationId: string, doctorUserId: string) {
  const invitation = await prisma.clinicInvitation.findFirst({
    where: {
      id: invitationId,
      doctorId: doctorUserId,
      status: ClinicInvitationStatus.PENDING,
    },
  });
  if (!invitation) throw new Error('Invitación no encontrada o ya respondida');

  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new Error('Perfil de médico no encontrado');

  const fid = invitation.facilityId;
  const hasFacility = await prisma.doctorProfileFacility.findUnique({
    where: {
      doctorProfileId_facilityId: { doctorProfileId: profile.id, facilityId: fid },
    },
  });
  if (!hasFacility) {
    await prisma.doctorProfileFacility.create({
      data: { doctorProfileId: profile.id, facilityId: fid },
    });
  }

  await prisma.clinicInvitation.update({
    where: { id: invitationId },
    data: { status: ClinicInvitationStatus.ACCEPTED, respondedAt: new Date() },
  });

  const facility = await prisma.medicalFacility.findUnique({ where: { id: fid } });
  const facilityName = facility?.name ?? 'la clínica';

  await upsertClinicInvitationNotification(doctorUserId, invitationId, {
    title: 'Invitación aceptada',
    message: `Te uniste a ${facilityName}. Ya puedes configurar horarios en esta sede.`,
    type: 'SUCCESS',
    isRead: true,
  });

  emitToUser(doctorUserId, 'notification:new', {
    category: 'CLINIC_INVITATION',
    title: 'Invitación aceptada',
    relatedId: invitationId,
  });

  emitToFacility(fid, 'clinic:roster:updated', {
    reason: 'invitation_accepted',
    facilityId: fid,
    doctorUserId,
    doctorName: (await prisma.user.findUnique({ where: { id: doctorUserId }, select: { name: true } }))
      ?.name,
  });

  const inviterId = invitation.invitedByUserId;
  if (inviterId) {
    emitToUser(inviterId, 'notification:new', {
      category: 'SYSTEM',
      title: 'Invitación aceptada',
      message: `Un médico aceptó unirse a ${facilityName}.`,
    });
  }

  const populated = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: doctorProfileInclude,
  });

  return { profile: mapDoctorProfile(populated), facilityName };
}

export async function rejectClinicInvitation(invitationId: string, doctorUserId: string) {
  const invitation = await prisma.clinicInvitation.findFirst({
    where: {
      id: invitationId,
      doctorId: doctorUserId,
      status: ClinicInvitationStatus.PENDING,
    },
  });
  if (!invitation) throw new Error('Invitación no encontrada o ya respondida');

  await prisma.clinicInvitation.update({
    where: { id: invitationId },
    data: { status: ClinicInvitationStatus.REJECTED, respondedAt: new Date() },
  });

  const facility = await prisma.medicalFacility.findUnique({
    where: { id: invitation.facilityId },
  });
  const facilityName = facility?.name ?? 'la clínica';

  await upsertClinicInvitationNotification(doctorUserId, invitationId, {
    title: 'Invitación rechazada',
    message: `Rechazaste unirte a ${facilityName}.`,
    type: 'INFO',
    isRead: true,
  });

  emitToUser(doctorUserId, 'notification:new', {
    category: 'CLINIC_INVITATION',
    title: 'Invitación rechazada',
    relatedId: invitationId,
  });

  emitToFacility(invitation.facilityId, 'clinic:roster:updated', {
    reason: 'invitation_rejected',
    facilityId: invitation.facilityId,
    doctorUserId,
  });

  const inviterId = invitation.invitedByUserId;
  if (inviterId) {
    emitToUser(inviterId, 'notification:new', {
      category: 'SYSTEM',
      title: 'Invitación rechazada',
      message: `Un médico rechazó unirse a ${facilityName}.`,
    });
  }

  return { facilityName };
}

export async function getPendingInvitationIdsForFacility(facilityId: string): Promise<string[]> {
  const rows = await prisma.clinicInvitation.findMany({
    where: { facilityId, status: ClinicInvitationStatus.PENDING },
    select: { doctorId: true },
  });
  return rows.map((r) => r.doctorId);
}
