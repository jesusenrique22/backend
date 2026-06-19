import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppointmentType, UserRole } from '../types/enums';
import { getAvailableSlots } from '../services/slots.service';
import { getDoctorConsultationDuration } from '../services/doctorDuration.service';
import { doctorProfileInclude, mapDoctorProfile } from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';

export const listSpecialties = async (_req: Request, res: Response) => {
  const specialties = await prisma.specialty.findMany({ orderBy: { name: 'asc' } });
  res.json(specialties.map(toApiDoc));
};

export const listFacilities = async (_req: Request, res: Response) => {
  const facilities = await prisma.medicalFacility.findMany({
    where: { isActive: true, serviceEnabled: true },
    orderBy: { name: 'asc' },
  });
  res.json(facilities.map(toApiDoc));
};

export const listLaboratories = async (_req: Request, res: Response) => {
  const laboratories = await prisma.laboratory.findMany({
    where: { isActive: true, serviceEnabled: true },
    include: { services: true },
    orderBy: { name: 'asc' },
  });
  res.json(laboratories.map(toApiDoc));
};

export const listDoctors = async (req: Request, res: Response) => {
  const where: {
    specialties?: { some: { specialtyId: string } };
    facilities?: { some: { facilityId: string } };
  } = {};

  if (req.query.specialtyId) {
    where.specialties = { some: { specialtyId: String(req.query.specialtyId) } };
  }
  if (req.query.facilityId) {
    where.facilities = { some: { facilityId: String(req.query.facilityId) } };
  }

  const profiles = await prisma.doctorProfile.findMany({
    where,
    include: doctorProfileInclude,
  });

  const userIds = profiles.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, role: UserRole.DOCTOR },
  });
  const usersSafe = users.map((u) => toApiDoc(omitPassword(u)));

  res.json(
    profiles.map((profile) => ({
      profile: mapDoctorProfile(profile),
      user: usersSafe.find((u) => u.id === profile.userId) ?? null,
    })),
  );
};

export const listMapPois = async (_req: Request, res: Response) => {
  const [facilities, laboratories, pharmacies, ambulances] = await Promise.all([
    prisma.medicalFacility.findMany({
      where: { isActive: true, serviceEnabled: true },
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        city: true,
        phone: true,
        latitude: true,
        longitude: true,
        hasEmergencyRoom: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.laboratory.findMany({
      where: { isActive: true, serviceEnabled: true },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.pharmacy.findMany({
      where: { isActive: true, serviceEnabled: true },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.ambulanceUnit.findMany({
      where: {
        isActive: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        facility: { select: { name: true, address: true } },
        driver: { select: { name: true, phone: true } },
      },
      orderBy: { callSign: 'asc' },
    }),
  ]);

  res.json({
    facilities: facilities.map((f) => ({
      ...toApiDoc(f),
      poiType: 'CLINIC',
    })),
    laboratories: laboratories.map((l) => ({
      ...toApiDoc(l),
      poiType: 'LABORATORY',
    })),
    pharmacies: pharmacies.map((p) => ({
      ...toApiDoc(p),
      poiType: 'PHARMACY',
    })),
    ambulances: ambulances.map((a) => ({
      id: a.id,
      name: a.callSign ?? a.plateNumber,
      plateNumber: a.plateNumber,
      callSign: a.callSign,
      address: a.facility?.address ?? a.facility?.name ?? '',
      facilityName: a.facility?.name ?? '',
      latitude: a.latitude,
      longitude: a.longitude,
      status: a.status,
      driverName: a.driver?.name ?? null,
      driverPhone: a.driver?.phone ?? null,
      poiType: 'AMBULANCE',
    })),
  });
};

export const doctorAvailability = async (req: Request, res: Response) => {
  const { doctorId } = req.params;
  const date = req.query.date as string;
  const rawType = (req.query.type as string)?.toUpperCase();
  const type =
    rawType === AppointmentType.ONLINE ? AppointmentType.ONLINE : AppointmentType.PRESENTIAL;
  const specialtyId = req.query.specialtyId as string | undefined;
  const facilityId = req.query.facilityId as string | undefined;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Parámetro date requerido (YYYY-MM-DD)' });
  }

  try {
    const durationMinutes = await getDoctorConsultationDuration(doctorId, specialtyId);
    const slots = await getAvailableSlots({ doctorId, date, type, durationMinutes, facilityId });
    res.json({ date, type, specialtyId, durationMinutes, slots });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};
