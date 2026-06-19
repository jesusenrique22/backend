import { wallClockToDate } from '../utils/appTimezone';
import { prisma } from '../lib/prisma';
import { AppointmentStatus, AppointmentType, DayOfWeek } from '../types/enums';
import { toApiDoc } from '../utils/apiDoc';

export type SlotDuration = number;

const JS_DAY_TO_ENUM: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

export interface TimeSlot {
  startTime: string;
  endTime: string;
  dateTime: string;
  facilityId?: string;
  facilityName?: string;
  available: boolean;
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function addMinutes(date: Date, mins: number): Date {
  return new Date(date.getTime() + mins * 60_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function normalizeDuration(raw?: number): SlotDuration {
  if (!raw || Number.isNaN(raw)) return 30;
  const rounded = Math.round(raw / 15) * 15;
  return Math.min(120, Math.max(15, rounded));
}

export function computeEndTime(start: Date, duration: SlotDuration): Date {
  return addMinutes(start, duration);
}

export async function getAvailableSlots(params: {
  doctorId: string;
  date: string;
  type: AppointmentType;
  durationMinutes: SlotDuration;
  facilityId?: string;
}): Promise<TimeSlot[]> {
  const { doctorId, date, type, durationMinutes, facilityId } = params;

  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error('Fecha inválida');
  }
  const [year, month, day] = parts;
  const dayDate = new Date(year, month - 1, day);
  const dayOfWeek = JS_DAY_TO_ENUM[dayDate.getDay()];

  const scheduleWhere: {
    doctorId: string;
    dayOfWeek: string;
    isActive: boolean;
    facilityId?: string | { in: string[] };
  } = {
    doctorId,
    dayOfWeek,
    isActive: true,
  };

  if (type === AppointmentType.PRESENTIAL && facilityId) {
    scheduleWhere.facilityId = facilityId;
  }

  if (type === AppointmentType.PRESENTIAL && !facilityId) {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
      include: { facilities: true },
    });
    if (profile?.facilities.length) {
      scheduleWhere.facilityId = { in: profile.facilities.map((f) => f.facilityId) };
    }
  }

  const schedules = await prisma.doctorWorkSchedule.findMany({
    where: scheduleWhere,
    include: { facility: { select: { id: true, name: true } } },
  });

  type Block = {
    startTime: string;
    endTime: string;
    facility: { _id: string; name: string } | null;
  };

  const blocks: Block[] = schedules.map((sched) => ({
    startTime: sched.startTime,
    endTime: sched.endTime,
    facility: sched.facility ? { _id: sched.facility.id, name: sched.facility.name } : null,
  }));

  if (blocks.length === 0 && type === AppointmentType.ONLINE) {
    blocks.push({ startTime: '09:00', endTime: '18:00', facility: null });
  }

  if (blocks.length === 0 && type === AppointmentType.PRESENTIAL && facilityId) {
    const facility = await prisma.medicalFacility.findUnique({
      where: { id: facilityId },
      select: { id: true, name: true },
    });
    if (facility) {
      blocks.push({
        startTime: '08:00',
        endTime: '18:00',
        facility: { _id: facility.id, name: facility.name },
      });
    }
  }

  const dayStart = new Date(dayDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayDate);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { not: AppointmentStatus.CANCELLED },
      dateTime: { gte: dayStart, lte: dayEnd },
    },
  });

  const slots: TimeSlot[] = [];
  const STEP = durationMinutes;

  for (const sched of blocks) {
    const startMin = toMinutes(sched.startTime);
    const endMin = toMinutes(sched.endTime);
    const facility = sched.facility;

    for (let min = startMin; min + durationMinutes <= endMin; min += STEP) {
      const slotStart = wallClockToDate(year, month, day, min);
      const slotEnd = computeEndTime(slotStart, durationMinutes);

      const isPast = slotStart.getTime() <= Date.now();
      const conflict = existing.some((appt) => {
        const apptEnd =
          appt.endTime ?? computeEndTime(appt.dateTime, normalizeDuration(appt.durationMinutes));
        return overlaps(slotStart, slotEnd, appt.dateTime, apptEnd);
      });

      slots.push({
        startTime: hhmm(min),
        endTime: hhmm(min + durationMinutes),
        dateTime: slotStart.toISOString(),
        facilityId: facility?._id,
        facilityName: facility?.name,
        available: !isPast && !conflict,
      });
    }
  }

  slots.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const byDateTime = new Map<string, TimeSlot>();
  for (const slot of slots) {
    const key = slot.dateTime;
    const prev = byDateTime.get(key);
    if (!prev) {
      byDateTime.set(key, slot);
      continue;
    }
    byDateTime.set(key, {
      ...prev,
      available: prev.available && slot.available,
      facilityId: prev.facilityId ?? slot.facilityId,
      facilityName:
        prev.facilityName && slot.facilityName && prev.facilityName !== slot.facilityName
          ? `${prev.facilityName} / ${slot.facilityName}`
          : prev.facilityName ?? slot.facilityName,
    });
  }

  return [...byDateTime.values()].sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
  );
}

export async function assertNoConflict(params: {
  doctorId: string;
  dateTime: Date;
  durationMinutes: SlotDuration;
  excludeId?: string;
}): Promise<void> {
  const { doctorId, dateTime, durationMinutes, excludeId } = params;
  const endTime = computeEndTime(dateTime, durationMinutes);

  const existing = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { not: AppointmentStatus.CANCELLED },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  const conflict = existing.find((appt) => {
    const apptEnd =
      appt.endTime ?? computeEndTime(appt.dateTime, normalizeDuration(appt.durationMinutes));
    return overlaps(dateTime, endTime, appt.dateTime, apptEnd);
  });

  if (conflict) {
    const dt = conflict.dateTime;
    const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    throw new Error(`El médico ya tiene una cita a las ${timeStr}. Elige otro horario.`);
  }
}
