import { prisma } from '../lib/prisma';
import { AppointmentStatus } from '../types/enums';

const eligibleStatus = { not: AppointmentStatus.CANCELLED };

export async function assertDoctorPatientCanCommunicate(
  doctorId: string,
  patientId: string,
): Promise<void> {
  const exists = await prisma.appointment.findFirst({
    where: { doctorId, patientId, status: eligibleStatus },
    select: { id: true },
  });

  if (!exists) {
    throw new Error(
      'Solo puedes comunicarte con personas con las que tengas una consulta (cita no cancelada).',
    );
  }
}

export async function getEligiblePeerIds(userId: string, isDoctor: boolean): Promise<string[]> {
  const appointments = isDoctor
    ? await prisma.appointment.findMany({
        where: { doctorId: userId, status: eligibleStatus },
        select: { patientId: true },
      })
    : await prisma.appointment.findMany({
        where: { patientId: userId, status: eligibleStatus },
        select: { doctorId: true },
      });

  const ids = new Set<string>();
  for (const a of appointments) {
    ids.add(isDoctor ? (a as { patientId: string }).patientId : (a as { doctorId: string }).doctorId);
  }
  return [...ids];
}

export function isEligiblePair(
  doctorId: string,
  patientId: string,
  eligiblePeerIds: string[],
  isDoctor: boolean,
): boolean {
  const peerId = isDoctor ? patientId : doctorId;
  return eligiblePeerIds.includes(peerId);
}

export function userIdFromRef(ref: unknown): string {
  if (ref == null) return '';
  if (typeof ref === 'object' && '_id' in (ref as object)) {
    return String((ref as { _id: unknown })._id);
  }
  if (typeof ref === 'object' && 'id' in (ref as object)) {
    return String((ref as { id: unknown }).id);
  }
  return String(ref);
}
