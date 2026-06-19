import { prisma } from '../lib/prisma';
import { normalizeDuration } from './slots.service';

export async function getDoctorConsultationDuration(
  doctorId: string,
  specialtyId?: string,
): Promise<number> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: { specialtyDurations: true },
  });
  if (!profile) return 30;

  if (specialtyId && profile.specialtyDurations.length) {
    const match = profile.specialtyDurations.find((entry) => entry.specialtyId === specialtyId);
    if (match?.durationMinutes) {
      return normalizeDuration(match.durationMinutes);
    }
  }

  return normalizeDuration(profile.defaultConsultationMinutes ?? 30);
}
