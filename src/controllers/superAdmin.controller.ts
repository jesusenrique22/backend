import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import { createStaffUser } from '../services/staffUser.service';
import { sanitizeUser } from '../utils/sanitizeUser';
import { toApiDoc } from '../utils/apiDoc';

export const getOverviewStats = async (_req: AuthRequest, res: Response) => {
  const [
    patients,
    doctors,
    clinicAdmins,
    pharmacyAdmins,
    labTechs,
    appointments,
    facilities,
    pharmacies,
    laboratories,
    pharmacyOrders,
    productsListed,
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.PATIENT } }),
    prisma.user.count({ where: { role: UserRole.DOCTOR } }),
    prisma.user.count({ where: { role: UserRole.CLINIC_ADMIN } }),
    prisma.user.count({ where: { role: UserRole.PHARMACY_ADMIN } }),
    prisma.user.count({ where: { role: UserRole.LAB_TECH } }),
    prisma.appointment.count(),
    prisma.medicalFacility.count(),
    prisma.pharmacy.count(),
    prisma.laboratory.count(),
    prisma.pharmacyOrder.count(),
    prisma.pharmacyProduct.count(),
  ]);

  res.json({
    patients,
    doctors,
    clinicAdmins,
    pharmacyAdmins,
    labTechs,
    appointments,
    facilities,
    pharmacies,
    laboratories,
    pharmacyOrders,
    productsListed,
  });
};

export const getFacilityStats = async (_req: AuthRequest, res: Response) => {
  const facilities = await prisma.medicalFacility.findMany({ orderBy: { name: 'asc' } });
  const stats = await Promise.all(
    facilities.map(async (facility) => {
      const appointmentsAtFacility = await prisma.appointment.count({
        where: { facilityId: facility.id, status: { not: 'CANCELLED' } },
      });
      const distinctPatients = await prisma.appointment.findMany({
        where: { facilityId: facility.id, status: { not: 'CANCELLED' } },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      return {
        facility: {
          id: facility.id,
          name: facility.name,
          city: facility.city,
          isActive: facility.isActive,
          serviceEnabled: facility.serviceEnabled,
        },
        appointmentsCount: appointmentsAtFacility,
        patientsViaApp: distinctPatients.length,
      };
    }),
  );
  res.json(stats);
};

export const getPharmacyStats = async (_req: AuthRequest, res: Response) => {
  const pharmacies = await prisma.pharmacy.findMany({ orderBy: { name: 'asc' } });
  const stats = await Promise.all(
    pharmacies.map(async (pharmacy) => {
      const [ordersCount, productsCount, revenueAgg] = await Promise.all([
        prisma.pharmacyOrder.count({ where: { pharmacyId: pharmacy.id } }),
        prisma.pharmacyProduct.count({ where: { pharmacyId: pharmacy.id } }),
        prisma.pharmacyOrder.aggregate({
          where: { pharmacyId: pharmacy.id },
          _sum: { total: true },
        }),
      ]);
      return {
        pharmacy: {
          id: pharmacy.id,
          name: pharmacy.name,
          isActive: pharmacy.isActive,
          serviceEnabled: pharmacy.serviceEnabled,
        },
        ordersCount,
        productsCount,
        revenueTotal: revenueAgg._sum.total ?? 0,
      };
    }),
  );
  res.json(stats);
};

export const listFacilities = async (_req: AuthRequest, res: Response) => {
  const facilities = await prisma.medicalFacility.findMany({ orderBy: { name: 'asc' } });
  res.json(facilities.map(toApiDoc));
};

export const createFacility = async (req: AuthRequest, res: Response) => {
  const { name, type, address, city, phone, latitude, longitude, hasEmergencyRoom } =
    req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre de la clínica es obligatorio' });
  }
  if (!address?.trim()) {
    return res.status(400).json({ error: 'La dirección es obligatoria' });
  }

  const allowedTypes = ['HOSPITAL', 'CLINIC', 'CONSULTORY'] as const;
  const facilityType = type && allowedTypes.includes(type) ? type : 'CLINIC';

  const existing = await prisma.medicalFacility.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una clínica con ese nombre' });
  }

  const facility = await prisma.medicalFacility.create({
    data: {
      name: name.trim(),
      type: facilityType,
      address: address.trim(),
      city: city?.trim() || undefined,
      phone: phone?.trim() || undefined,
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
      hasEmergencyRoom: Boolean(hasEmergencyRoom),
      isActive: true,
      serviceEnabled: true,
    },
  });

  res.status(201).json(toApiDoc(facility));
};

export const listPharmacies = async (_req: AuthRequest, res: Response) => {
  const pharmacies = await prisma.pharmacy.findMany({ orderBy: { name: 'asc' } });
  res.json(pharmacies.map(toApiDoc));
};

export const listLaboratories = async (_req: AuthRequest, res: Response) => {
  const laboratories = await prisma.laboratory.findMany({
    include: { services: true },
    orderBy: { name: 'asc' },
  });
  res.json(laboratories.map(toApiDoc));
};

export const createLaboratory = async (req: AuthRequest, res: Response) => {
  const { name, address, phone, logoUrl, services } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre del laboratorio es obligatorio' });
  }
  if (!address?.trim()) {
    return res.status(400).json({ error: 'La dirección es obligatoria' });
  }

  const existing = await prisma.laboratory.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Ya existe un laboratorio con ese nombre' });
  }

  const servicesData = Array.isArray(services)
    ? services.map((s: any) => ({
        name: String(s.name || '').trim(),
        price: Number(s.price || 0),
        requirements: String(s.requirements || '').trim(),
      }))
    : [];

  const laboratory = await prisma.laboratory.create({
    data: {
      name: name.trim(),
      address: address.trim(),
      phone: phone?.trim() || undefined,
      logoUrl: logoUrl?.trim() || undefined,
      isActive: true,
      serviceEnabled: true,
      services: {
        create: servicesData,
      },
    },
    include: {
      services: true,
    },
  });

  res.status(201).json(toApiDoc(laboratory));
};

export const setLaboratoryService = async (req: AuthRequest, res: Response) => {
  const { serviceEnabled } = req.body;
  if (typeof serviceEnabled !== 'boolean') {
    return res.status(400).json({ error: 'serviceEnabled debe ser true o false' });
  }
  try {
    const laboratory = await prisma.laboratory.update({
      where: { id: req.params.id },
      data: { serviceEnabled },
    });
    res.json(toApiDoc(laboratory));
  } catch {
    return res.status(404).json({ error: 'Laboratorio no encontrado' });
  }
};

export const getLaboratoryStats = async (_req: AuthRequest, res: Response) => {
  const laboratories = await prisma.laboratory.findMany({ orderBy: { name: 'asc' } });
  const stats = await Promise.all(
    laboratories.map(async (laboratory) => {
      const staffCount = await prisma.user.count({
        where: { laboratoryId: laboratory.id, role: UserRole.LAB_TECH },
      });
      return {
        laboratory: {
          id: laboratory.id,
          name: laboratory.name,
          isActive: laboratory.isActive,
          serviceEnabled: laboratory.serviceEnabled,
        },
        staffCount,
      };
    }),
  );
  res.json(stats);
};

export const setFacilityService = async (req: AuthRequest, res: Response) => {
  const { serviceEnabled } = req.body;
  if (typeof serviceEnabled !== 'boolean') {
    return res.status(400).json({ error: 'serviceEnabled debe ser true o false' });
  }
  try {
    const facility = await prisma.medicalFacility.update({
      where: { id: req.params.id },
      data: { serviceEnabled },
    });
    res.json(toApiDoc(facility));
  } catch {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }
};

export const setPharmacyService = async (req: AuthRequest, res: Response) => {
  const { serviceEnabled } = req.body;
  if (typeof serviceEnabled !== 'boolean') {
    return res.status(400).json({ error: 'serviceEnabled debe ser true o false' });
  }
  try {
    const pharmacy = await prisma.pharmacy.update({
      where: { id: req.params.id },
      data: { serviceEnabled },
    });
    res.json(toApiDoc(pharmacy));
  } catch {
    return res.status(404).json({ error: 'Farmacia no encontrada' });
  }
};

export const createClinicAdmin = async (req: AuthRequest, res: Response) => {
  const { name, email, phone, facilityId } = req.body;
  if (!name?.trim() || !email?.trim() || !facilityId) {
    return res.status(400).json({ error: 'Nombre, correo y clínica son obligatorios' });
  }

  const facility = await prisma.medicalFacility.findUnique({ where: { id: facilityId } });
  if (!facility) return res.status(400).json({ error: 'Clínica no encontrada' });

  try {
    const result = await createStaffUser({
      name,
      email,
      phone,
      role: UserRole.CLINIC_ADMIN,
      createdBy: req.user!.id,
      managedFacilityId: facilityId,
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

export const createLabTech = async (req: AuthRequest, res: Response) => {
  const { name, email, phone, laboratoryId } = req.body;
  if (!name?.trim() || !email?.trim() || !laboratoryId) {
    return res.status(400).json({
      error: 'Nombre, correo y laboratorio son obligatorios',
    });
  }

  const laboratory = await prisma.laboratory.findUnique({ where: { id: laboratoryId } });
  if (!laboratory) return res.status(400).json({ error: 'Laboratorio no encontrado' });

  try {
    const result = await createStaffUser({
      name,
      email,
      phone,
      role: UserRole.LAB_TECH,
      createdBy: req.user!.id,
      laboratoryId,
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

export const createPharmacyAdmin = async (req: AuthRequest, res: Response) => {
  const { name, email, phone, pharmacyId } = req.body;
  if (!name?.trim() || !email?.trim() || !pharmacyId) {
    return res.status(400).json({ error: 'Nombre, correo y farmacia son obligatorios' });
  }

  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId } });
  if (!pharmacy) return res.status(400).json({ error: 'Farmacia no encontrada' });

  try {
    const result = await createStaffUser({
      name,
      email,
      phone,
      role: UserRole.PHARMACY_ADMIN,
      createdBy: req.user!.id,
      pharmacyId,
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

export const listManagedUsers = async (req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: {
      createdById: req.user!.id,
      role: { in: [UserRole.CLINIC_ADMIN, UserRole.PHARMACY_ADMIN, UserRole.LAB_TECH] },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users.map(sanitizeUser));
};
