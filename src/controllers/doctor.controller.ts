import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { AppointmentStatus } from '../types/enums';
import { recordCompletedVisit } from './appointment.controller';
import {
  completeAppointmentWithReport,
  type ConsultationReportInput,
} from '../services/consultationReport.service';
import { assertDoctorFacility } from '../utils/doctorFacilities';
import {
  acceptClinicInvitation as acceptClinicInvitationService,
  rejectClinicInvitation as rejectClinicInvitationService,
} from '../services/clinicInvitation.service';
import { dismissConsultationClosureReminder } from '../services/notification.service';
import {
  addSpecialtyToDoctorProfile,
  createSpecialtyAndAddToDoctorProfile,
  removeSpecialtyFromDoctorProfile,
  updateDoctorProfileDetails,
  updateSpecialtyConsultationDuration,
} from '../services/doctorProfileSpecialty.service';
import {
  appointmentInclude,
  doctorProfileInclude,
  mapAppointment,
  mapDoctorProfile,
  mapMedicalHistory,
  mapWorkSchedule,
} from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';

interface WeightControlRecord {
  weightKg?: string;
  fatPercent?: string;
  visceral?: string;
  muscleKg?: string;
  bmi?: string;
  doseDate?: string;
  dose?: string;
}

async function assertGeneralMedicineDoctor(doctorId: string): Promise<void> {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    include: { specialties: { include: { specialty: true } } },
  });
  if (!profile) throw new Error('Perfil de médico no encontrado');

  const names = profile.specialties.map((s) => s.specialty.name.toLowerCase());
  const isGeneral = names.some((n) => n.includes('medicina general') || n === 'general');
  if (!isGeneral) {
    throw new Error(
      'Solo los médicos de Medicina General pueden registrar el control de peso del paciente',
    );
  }
}

export const changeMyPassword = async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(String(newPassword), 10) },
  });

  res.json({ message: 'Contraseña actualizada correctamente' });
};

export const getMyProfile = async (req: AuthRequest, res: Response) => {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: req.user!.id },
    include: doctorProfileInclude,
  });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  res.json({
    user: user ? toApiDoc(omitPassword(user)) : null,
    profile: profile ? mapDoctorProfile(profile) : null,
  });
};

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  const existing = await prisma.doctorProfile.findUnique({ where: { userId: req.user!.id } });
  if (!existing) return res.status(404).json({ error: 'Perfil de doctor no encontrado' });

  const allowed = [
    'documentId',
    'licenseNumber',
    'bio',
    'consultationPriceOnline',
    'consultationPricePresential',
    'defaultConsultationMinutes',
  ] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }

  const profile = await prisma.doctorProfile.update({
    where: { id: existing.id },
    data,
    include: doctorProfileInclude,
  });
  res.json(mapDoctorProfile(profile));
};

export const getMySchedules = async (req: AuthRequest, res: Response) => {
  const schedules = await prisma.doctorWorkSchedule.findMany({
    where: { doctorId: req.user!.id, isActive: true },
    include: { facility: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  res.json(schedules.map(mapWorkSchedule));
};

export const createSchedule = async (req: AuthRequest, res: Response) => {
  const { facilityId } = req.body;
  if (!facilityId) {
    return res.status(400).json({ error: 'facilityId es obligatorio' });
  }
  try {
    await assertDoctorFacility(req.user!.id, facilityId);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const schedule = await prisma.doctorWorkSchedule.create({
    data: { ...req.body, doctorId: req.user!.id },
    include: { facility: true },
  });
  res.status(201).json(mapWorkSchedule(schedule));
};

export const updateSchedule = async (req: AuthRequest, res: Response) => {
  if (req.body.facilityId) {
    try {
      await assertDoctorFacility(req.user!.id, req.body.facilityId);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  const existing = await prisma.doctorWorkSchedule.findFirst({
    where: { id: req.params.id, doctorId: req.user!.id },
  });
  if (!existing) return res.status(404).json({ error: 'Horario no encontrado' });

  const schedule = await prisma.doctorWorkSchedule.update({
    where: { id: existing.id },
    data: req.body,
    include: { facility: true },
  });
  res.json(mapWorkSchedule(schedule));
};

export const deleteSchedule = async (req: AuthRequest, res: Response) => {
  const result = await prisma.doctorWorkSchedule.deleteMany({
    where: { id: req.params.id, doctorId: req.user!.id },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Horario no encontrado' });
  res.json({ message: 'Horario eliminado' });
};

export const getMyAppointments = async (req: AuthRequest, res: Response) => {
  const where: {
    doctorId: string;
    status?: string;
    dateTime?: { gte: Date; lt: Date };
  } = { doctorId: req.user!.id };

  if (req.query.status) where.status = String(req.query.status);
  if (req.query.date) {
    const day = new Date(req.query.date as string);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    where.dateTime = { gte: day, lt: next };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: { dateTime: 'asc' },
  });
  res.json(appointments.map(mapAppointment));
};

export const updateAppointmentStatus = async (req: AuthRequest, res: Response) => {
  const { status, notes, clinicalNotes, report } = req.body as {
    status?: string;
    notes?: string;
    clinicalNotes?: string;
    report?: ConsultationReportInput;
  };

  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, doctorId: req.user!.id },
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
      consultationReport: true,
    },
  });
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });

  const updateData: { status?: string; notes?: string } = {};
  if (status) updateData.status = status;
  if (notes !== undefined) updateData.notes = notes;

  if (status === AppointmentStatus.COMPLETED) {
    if (report && typeof report === 'object') {
      try {
        await completeAppointmentWithReport(appointment, req.user!.id, report);
        await dismissConsultationClosureReminder(req.user!.id, appointment.id);
        await prisma.notification.create({
          data: {
            userId: appointment.patientId,
            title: 'Resumen de tu consulta',
            message: `El Dr(a). ${appointment.doctor.name} registró tu receta e indicaciones. También las verás en el chat clínico y en Mis citas.`,
            type: 'INFO',
            category: 'APPOINTMENT',
            relatedPath: '/appointments',
            relatedId: appointment.id,
          },
        });
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
    } else if (!appointment.consultationReport) {
      return res.status(400).json({
        error:
          'Debes completar el informe de consulta (hallazgos, diagnóstico, medicación e instrucciones)',
      });
    } else {
      await recordCompletedVisit(appointment, req.user!.id, clinicalNotes);
    }
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: updateData,
  });

  const populated = await prisma.appointment.findUnique({
    where: { id: appointment.id },
    include: appointmentInclude,
  });
  res.json(populated ? mapAppointment(populated) : null);
};

export const getPatientMedicalHistory = async (req: AuthRequest, res: Response) => {
  const hasRelation = await prisma.appointment.findFirst({
    where: { doctorId: req.user!.id, patientId: req.params.patientId },
    select: { id: true },
  });
  if (!hasRelation) {
    return res.status(403).json({
      error: 'Solo puedes ver el historial de pacientes que hayas atendido',
    });
  }

  const [history, profile] = await Promise.all([
    prisma.medicalHistory.findUnique({
      where: { patientId: req.params.patientId },
      include: { entries: { include: { doctor: true }, orderBy: { date: 'desc' } } },
    }),
    prisma.patientProfile.findUnique({
      where: { userId: req.params.patientId },
      include: { weightControls: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  res.json({
    profile: profile ? toApiDoc(profile) : null,
    history: history ? mapMedicalHistory(history) : { entries: [] },
  });
};

export const addMedicalHistoryEntry = async (req: AuthRequest, res: Response) => {
  const { patientId } = req.params;

  const hasRelation = await prisma.appointment.findFirst({
    where: { doctorId: req.user!.id, patientId },
    select: { id: true },
  });
  if (!hasRelation) {
    return res.status(403).json({ error: 'Sin relación médico-paciente' });
  }

  let history = await prisma.medicalHistory.findUnique({ where: { patientId } });
  if (!history) {
    history = await prisma.medicalHistory.create({ data: { patientId } });
  }

  await prisma.medicalHistoryEntry.create({
    data: {
      medicalHistoryId: history.id,
      doctorId: req.user!.id,
      title: req.body.title,
      description: req.body.description,
      diagnosis: req.body.diagnosis,
      treatment: req.body.treatment,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      attachments: req.body.attachments ?? [],
    },
  });

  const updated = await prisma.medicalHistory.findUniqueOrThrow({
    where: { id: history.id },
    include: { entries: { include: { doctor: true }, orderBy: { date: 'desc' } } },
  });
  res.status(201).json(mapMedicalHistory(updated));
};

export const updatePatientWeightControls = async (req: AuthRequest, res: Response) => {
  const { patientId } = req.params;
  const { weightControls } = req.body as { weightControls?: WeightControlRecord[] };

  if (!Array.isArray(weightControls)) {
    return res.status(400).json({ error: 'weightControls debe ser un arreglo' });
  }

  try {
    await assertGeneralMedicineDoctor(req.user!.id);
  } catch (e) {
    return res.status(403).json({ error: (e as Error).message });
  }

  const hasRelation = await prisma.appointment.findFirst({
    where: { doctorId: req.user!.id, patientId },
    select: { id: true },
  });
  if (!hasRelation) {
    return res.status(403).json({
      error: 'Solo puedes actualizar pacientes con los que hayas tenido citas',
    });
  }

  const profile = await prisma.patientProfile.findUnique({ where: { userId: patientId } });
  if (!profile) return res.status(404).json({ error: 'Perfil del paciente no encontrado' });

  await prisma.$transaction([
    prisma.patientWeightControl.deleteMany({ where: { patientProfileId: profile.id } }),
    prisma.patientWeightControl.createMany({
      data: weightControls.map((w, i) => ({
        patientProfileId: profile.id,
        sortOrder: i,
        weightKg: w.weightKg,
        fatPercent: w.fatPercent,
        visceral: w.visceral,
        muscleKg: w.muscleKg,
        bmi: w.bmi,
        doseDate: w.doseDate,
        dose: w.dose,
      })),
    }),
  ]);

  const updated = await prisma.patientProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: { weightControls: { orderBy: { sortOrder: 'asc' } } },
  });

  const { weightControls: wc, ...rest } = updated;
  res.json(
    toApiDoc({
      ...rest,
      weightControls: wc.map((w) => ({
        weightKg: w.weightKg,
        fatPercent: w.fatPercent,
        visceral: w.visceral,
        muscleKg: w.muscleKg,
        bmi: w.bmi,
        doseDate: w.doseDate,
        dose: w.dose,
      })),
    }),
  );
};

export const getMyPatients = async (req: AuthRequest, res: Response) => {
  const apptPatients = await prisma.appointment.findMany({
    where: { doctorId: req.user!.id },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  const chatPatients = await prisma.chatConversation.findMany({
    where: { doctorId: req.user!.id },
    select: { patientId: true },
  });
  const ids = [
    ...new Set([
      ...apptPatients.map((a) => a.patientId),
      ...chatPatients.map((c) => c.patientId),
    ]),
  ];

  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const profiles = await prisma.patientProfile.findMany({ where: { userId: { in: ids } } });

  res.json(
    users.map((u) => {
      const pr = profiles.find((p) => p.userId === u.id);
      return {
        user: toApiDoc(omitPassword(u)),
        profile: pr ? toApiDoc(pr) : null,
      };
    }),
  );
};

export const addMySpecialty = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await addSpecialtyToDoctorProfile(req.user!.id, String(req.body.specialtyId));
    res.status(201).json({ message: 'Especialidad agregada a tu perfil', profile });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const createAndAddMySpecialty = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await createSpecialtyAndAddToDoctorProfile(
      req.user!.id,
      String(req.body.name ?? ''),
    );
    res.status(201).json({
      message: 'Nueva especialidad registrada y agregada a tu perfil',
      profile,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const removeMySpecialty = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await removeSpecialtyFromDoctorProfile(req.user!.id, req.params.specialtyId);
    res.json({ message: 'Especialidad eliminada de tu perfil', profile });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const updateMySpecialtyDuration = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await updateSpecialtyConsultationDuration(
      req.user!.id,
      req.params.specialtyId,
      Number(req.body.durationMinutes),
    );
    res.json({ message: 'Duración actualizada', profile });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const patchMyProfileDetails = async (req: AuthRequest, res: Response) => {
  try {
    const result = await updateDoctorProfileDetails(req.user!.id, req.body);
    res.json({ message: 'Perfil actualizado', user: result.user, profile: result.profile });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const acceptClinicInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const result = await acceptClinicInvitationService(req.params.id, req.user!.id);
    res.json({
      message: `Te uniste a ${result.facilityName} correctamente`,
      profile: result.profile,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const rejectClinicInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const result = await rejectClinicInvitationService(req.params.id, req.user!.id);
    res.json({ message: `Rechazaste la invitación a ${result.facilityName}` });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};
