import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppointmentStatus, AppointmentType, UserRole } from '../types/enums';
import {
  assertNoConflict,
  computeEndTime,
  normalizeDuration,
} from '../services/slots.service';
import { getDoctorConsultationDuration } from '../services/doctorDuration.service';
import { assertDoctorFacility } from '../utils/doctorFacilities';
import { isSuperAdminRole } from '../utils/roleHelpers';
import { recalculateDoctorRating } from '../services/doctorRating.service';
import { appointmentInclude, mapAppointment } from '../utils/prismaMappers';
import type { Appointment } from '@prisma/client';

async function loadAppointment(id: string) {
  const row = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  return row ? mapAppointment(row) : null;
}

export async function recordCompletedVisit(
  appointment: Appointment,
  doctorId: string,
  clinicalNotes?: string,
): Promise<void> {
  const title =
    appointment.reason?.trim() ||
    `Consulta ${appointment.type === AppointmentType.ONLINE ? 'telemedicina' : 'presencial'}`;

  let history = await prisma.medicalHistory.findUnique({
    where: { patientId: appointment.patientId },
  });
  if (!history) {
    history = await prisma.medicalHistory.create({
      data: { patientId: appointment.patientId },
    });
  }

  await prisma.medicalHistoryEntry.create({
    data: {
      medicalHistoryId: history.id,
      date: appointment.dateTime,
      doctorId,
      title,
      description:
        clinicalNotes?.trim() ||
        appointment.notes?.trim() ||
        'Consulta completada.',
      diagnosis: appointment.reason,
      treatment: clinicalNotes || appointment.notes,
    },
  });
}

export const createAppointment = async (req: AuthRequest, res: Response) => {
  const {
    doctorId,
    facilityId,
    specialtyId,
    dateTime,
    type,
    reason,
    durationMinutes: rawDuration,
  } = req.body;

  if (!doctorId || !dateTime || !type) {
    return res.status(400).json({ error: 'doctorId, dateTime y type son obligatorios' });
  }

  if (!Object.values(AppointmentType).includes(type)) {
    return res.status(400).json({ error: 'type inválido: ONLINE o PRESENTIAL' });
  }

  const resolvedSpecialtyId = specialtyId as string | undefined;
  const duration =
    rawDuration != null
      ? normalizeDuration(Number(rawDuration))
      : await getDoctorConsultationDuration(doctorId, resolvedSpecialtyId);

  const start = new Date(dateTime);
  if (Number.isNaN(start.getTime())) {
    return res.status(400).json({ error: 'dateTime inválido' });
  }
  if (start.getTime() < Date.now()) {
    return res.status(400).json({ error: 'No se pueden agendar citas en el pasado' });
  }

  if (type === AppointmentType.PRESENTIAL) {
    if (!facilityId) {
      return res.status(400).json({ error: 'facilityId es obligatorio para citas presenciales' });
    }
    try {
      await assertDoctorFacility(doctorId, facilityId);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  try {
    await assertNoConflict({ doctorId, dateTime: start, durationMinutes: duration });
  } catch (e) {
    return res.status(409).json({ error: (e as Error).message });
  }

  const patientId =
    req.user!.role === UserRole.PATIENT ? req.user!.id : req.body.patientId;
  if (!patientId) return res.status(400).json({ error: 'patientId requerido' });

  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorId } });
  const price =
    type === AppointmentType.ONLINE
      ? doctorProfile?.consultationPriceOnline ?? 25
      : doctorProfile?.consultationPricePresential ?? 45;

  const endTime = computeEndTime(start, duration);

  const appointment = await prisma.appointment.create({
    data: {
      patientId,
      doctorId,
      facilityId: type === AppointmentType.PRESENTIAL ? facilityId : undefined,
      specialtyId,
      dateTime: start,
      endTime,
      durationMinutes: duration,
      type,
      reason,
      price,
      status: AppointmentStatus.CONFIRMED,
    },
  });

  const populated = await loadAppointment(appointment.id);
  res.status(201).json(populated);
};

export const getAppointmentById = async (req: AuthRequest, res: Response) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: appointmentInclude,
  });

  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });

  const userId = req.user!.id;
  const ok =
    appointment.patientId === userId ||
    appointment.doctorId === userId ||
    isSuperAdminRole(req.user!.role);

  if (!ok) return res.status(403).json({ error: 'Acceso denegado' });
  res.json(mapAppointment(appointment));
};

export const cancelAppointment = async (req: AuthRequest, res: Response) => {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });

  const userId = req.user!.id;
  const ok =
    appointment.patientId === userId ||
    appointment.doctorId === userId ||
    isSuperAdminRole(req.user!.role);

  if (!ok) return res.status(403).json({ error: 'Acceso denegado' });

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
  });

  const populated = await loadAppointment(appointment.id);
  res.json(populated);
};

export const rateAppointment = async (req: AuthRequest, res: Response) => {
  const stars = Number(req.body.rating);
  const comment =
    typeof req.body.comment === 'string' ? req.body.comment.trim() : undefined;

  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5 estrellas' });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });

  if (appointment.patientId !== req.user!.id) {
    return res.status(403).json({ error: 'Solo el paciente puede calificar esta cita' });
  }

  if (appointment.status !== AppointmentStatus.COMPLETED) {
    return res.status(400).json({
      error: 'Solo puedes calificar citas que ya fueron completadas',
    });
  }

  if (appointment.patientRating != null) {
    return res.status(400).json({ error: 'Ya calificaste esta consulta' });
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      patientRating: Math.round(stars),
      patientReview: comment || null,
      ratedAt: new Date(),
    },
  });

  await recalculateDoctorRating(appointment.doctorId);

  const populated = await loadAppointment(appointment.id);
  res.json(populated);
};

export const acknowledgeConsultationReport = async (req: AuthRequest, res: Response) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { consultationReport: true },
  });
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
  if (appointment.patientId !== req.user!.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (!appointment.consultationReport) {
    return res.status(400).json({ error: 'Esta cita aún no tiene informe del médico' });
  }

  await prisma.appointmentConsultationReport.update({
    where: { appointmentId: appointment.id },
    data: { patientAcknowledgedAt: new Date() },
  });

  const populated = await loadAppointment(appointment.id);
  res.json(populated);
};
