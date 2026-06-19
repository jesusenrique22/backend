import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { appointmentInclude, mapAppointment, mapMedicalHistory } from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';
import { UserRole } from '../types/enums';
import { ensurePatientProfile } from '../services/userProfile.service';

export const getMyProfile = async (req: AuthRequest, res: Response) => {
  let profile = await prisma.patientProfile.findUnique({
    where: { userId: req.user!.id },
    include: { weightControls: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!profile) {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || user.role !== UserRole.PATIENT) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    await ensurePatientProfile(user);
    profile = await prisma.patientProfile.findUnique({
      where: { userId: req.user!.id },
      include: { weightControls: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

  const { weightControls, ...rest } = profile;
  res.json(
    toApiDoc({
      ...rest,
      weightControls: weightControls.map((w) => ({
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

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const body = { ...req.body };
  delete body.weightControls;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== UserRole.PATIENT) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  await ensurePatientProfile(user);

  const profile = await prisma.patientProfile.update({
    where: { userId },
    data: body,
  });

  await prisma.medicalHistory.upsert({
    where: { patientId: userId },
    create: {
      patientId: userId,
      bloodType: profile.bloodType,
      allergies: profile.allergies,
      chronicConditions: profile.chronicConditions,
      currentMedications: profile.currentMedications,
      surgeries: profile.surgeries,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
    },
    update: {
      bloodType: profile.bloodType,
      allergies: profile.allergies,
      chronicConditions: profile.chronicConditions,
      currentMedications: profile.currentMedications,
      surgeries: profile.surgeries,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
    },
  });

  res.json(toApiDoc(profile));
};

export const getMyMedicalHistory = async (req: AuthRequest, res: Response) => {
  let history = await prisma.medicalHistory.findUnique({
    where: { patientId: req.user!.id },
    include: { entries: { include: { doctor: true }, orderBy: { date: 'desc' } } },
  });
  if (!history) {
    history = await prisma.medicalHistory.create({
      data: { patientId: req.user!.id },
      include: { entries: { include: { doctor: true } } },
    });
  }
  res.json(mapMedicalHistory(history));
};

export const getMyAppointments = async (req: AuthRequest, res: Response) => {
  const appointments = await prisma.appointment.findMany({
    where: { patientId: req.user!.id },
    include: appointmentInclude,
    orderBy: { dateTime: 'asc' },
  });
  res.json(appointments.map(mapAppointment));
};

export const getDoctorById = async (req: AuthRequest, res: Response) => {
  const doctor = await prisma.user.findUnique({ where: { id: req.params.doctorId } });
  if (!doctor || doctor.role !== UserRole.DOCTOR) {
    return res.status(404).json({ error: 'Doctor no encontrado' });
  }
  res.json(toApiDoc(omitPassword(doctor)));
};
