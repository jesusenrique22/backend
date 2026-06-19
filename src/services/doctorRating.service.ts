import { prisma } from '../lib/prisma';
import { AppointmentStatus } from '../types/enums';

export async function recalculateDoctorRating(doctorId: string): Promise<void> {
  const agg = await prisma.appointment.aggregate({
    where: {
      doctorId,
      status: AppointmentStatus.COMPLETED,
      patientRating: { not: null },
    },
    _avg: { patientRating: true },
    _count: { patientRating: true },
  });

  const rating =
    agg._avg.patientRating != null ? Math.round(agg._avg.patientRating * 10) / 10 : 5;
  const ratingCount = agg._count.patientRating ?? 0;

  await prisma.doctorProfile.updateMany({
    where: { userId: doctorId },
    data: { rating, ratingCount },
  });
}
