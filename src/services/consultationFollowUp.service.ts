import { prisma } from '../lib/prisma';
import { toApiDoc } from '../utils/apiDoc';

export type FollowUpStatus = 'upcoming' | 'due_today' | 'overdue';

function computeFollowUpStatus(followUpDate: Date, now = new Date()): FollowUpStatus {
  const dayStart = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const target = dayStart(followUpDate);
  const today = dayStart(now);
  if (target.getTime() < today.getTime()) return 'overdue';
  if (target.getTime() === today.getTime()) return 'due_today';
  return 'upcoming';
}

function mapFollowUpItem(row: {
  id: string;
  followUpDate: Date | null;
  followUpNote: string | null;
  patientAcknowledgedAt: Date | null;
  appointment: {
    id: string;
    dateTime: Date;
    patientId: string;
    doctorId: string;
    patient: { id: string; name: string; profilePic: string | null };
    doctor: { id: string; name: string; profilePic: string | null };
    specialty: { name: string } | null;
  };
}) {
  if (!row.followUpDate) return null;
  return toApiDoc({
    reportId: row.id,
    appointmentId: row.appointment.id,
    consultationDate: row.appointment.dateTime,
    followUpDate: row.followUpDate,
    followUpNote: row.followUpNote,
    patientAcknowledged: row.patientAcknowledgedAt != null,
    patientId: row.appointment.patientId,
    patientName: row.appointment.patient.name,
    patientAvatar: row.appointment.patient.profilePic,
    doctorId: row.appointment.doctorId,
    doctorName: row.appointment.doctor.name,
    doctorAvatar: row.appointment.doctor.profilePic,
    specialty: row.appointment.specialty?.name ?? '',
    status: computeFollowUpStatus(row.followUpDate),
  });
}

function filterRelevantFollowUps<
  T extends { followUpDate: Date | null },
  R extends { status: FollowUpStatus },
>(
  rows: T[],
  mapped: (R | null)[],
  horizon: Date,
): R[] {
  const result: R[] = [];
  for (let i = 0; i < rows.length; i++) {
    const item = mapped[i];
    const row = rows[i];
    if (!item || !row.followUpDate) continue;
    if (item.status === 'overdue' || row.followUpDate <= horizon) {
      result.push(item);
    }
  }
  return result;
}

export async function listDoctorFollowUps(doctorId: string, daysAhead = 30) {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + daysAhead);

  const rows = await prisma.appointmentConsultationReport.findMany({
    where: {
      followUpDate: { not: null },
      appointment: {
        doctorId,
        status: 'COMPLETED',
      },
    },
    include: {
      appointment: {
        include: {
          patient: { select: { id: true, name: true, profilePic: true } },
          doctor: { select: { id: true, name: true, profilePic: true } },
          specialty: { select: { name: true } },
        },
      },
    },
    orderBy: { followUpDate: 'asc' },
  });

  return filterRelevantFollowUps(rows, rows.map(mapFollowUpItem), horizon);
}

export async function listPatientFollowUps(patientId: string, daysAhead = 30) {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + daysAhead);

  const rows = await prisma.appointmentConsultationReport.findMany({
    where: {
      followUpDate: { not: null },
      appointment: {
        patientId,
        status: 'COMPLETED',
      },
    },
    include: {
      appointment: {
        include: {
          patient: { select: { id: true, name: true, profilePic: true } },
          doctor: { select: { id: true, name: true, profilePic: true } },
          specialty: { select: { name: true } },
        },
      },
    },
    orderBy: { followUpDate: 'asc' },
  });

  return filterRelevantFollowUps(rows, rows.map(mapFollowUpItem), horizon);
}
