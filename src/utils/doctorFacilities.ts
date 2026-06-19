import { prisma } from '../lib/prisma';

export async function doctorHasFacility(
  doctorUserId: string,
  facilityId: string,
): Promise<boolean> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: { facilities: { where: { facilityId } } },
  });
  if (!profile) return false;
  return profile.facilities.length > 0;
}

export async function assertDoctorFacility(
  doctorUserId: string,
  facilityId: string,
): Promise<void> {
  const ok = await doctorHasFacility(doctorUserId, facilityId);
  if (!ok) {
    throw new Error('La clínica no está asociada al perfil de este médico');
  }
}

export function facilityIdsAsStrings(facilityIds: { facilityId: string }[] | string[]): string[] {
  if (facilityIds.length === 0) return [];
  if (typeof facilityIds[0] === 'string') {
    return facilityIds as string[];
  }
  return (facilityIds as { facilityId: string }[]).map((f) => f.facilityId);
}
