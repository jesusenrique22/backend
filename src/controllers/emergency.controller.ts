import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  AmbulanceUnitStatus,
  EmergencyRequestStatus,
  UserRole,
} from '../types/enums';
import {
  acceptEmergencyRequest,
  cancelEmergencyRequest,
  createAmbulanceUnit,
  createEmergencyChatMessage,
  createEmergencyRequest,
  getEmergencyRequestForUser,
  listDriverEmergencies,
  listEmergencyMessages,
  listFacilityAmbulances,
  listFacilityEmergencies,
  listPatientEmergencies,
  listPendingFacilityRequests,
  updateAmbulanceLocation,
  updateAmbulanceUnit,
  updateEmergencyStatus,
} from '../services/emergency.service';
import { toApiDoc } from '../utils/apiDoc';

export const postEmergency = async (req: AuthRequest, res: Response) => {
  const {
    facilityId,
    originLat,
    originLng,
    originAddress,
    symptoms,
    painLevel,
    medicalHistory,
    paymentMethod,
  } = req.body as {
    facilityId?: string;
    originLat?: number;
    originLng?: number;
    originAddress?: string;
    symptoms?: string;
    painLevel?: number;
    medicalHistory?: string;
    paymentMethod?: string;
  };

  if (!facilityId || originLat == null || originLng == null) {
    return res.status(400).json({
      error: 'facilityId, originLat y originLng son obligatorios',
    });
  }

  try {
    const emergency = await createEmergencyRequest({
      patientId: req.user!.id,
      facilityId,
      originLat: Number(originLat),
      originLng: Number(originLng),
      originAddress,
      symptoms,
      painLevel: painLevel != null ? Number(painLevel) : undefined,
      medicalHistory,
      paymentMethod,
    });
    res.status(201).json(toApiDoc(emergency));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const getEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const emergency = await getEmergencyRequestForUser(
      req.params.id,
      req.user!.id,
      req.user!.role,
    );
    if (!emergency) return res.status(404).json({ error: 'No encontrada' });
    res.json(toApiDoc(emergency));
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('No autorizado') ? 403 : 400).json({ error: message });
  }
};

export const listMyEmergencies = async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  try {
    if (role === UserRole.PATIENT) {
      const items = await listPatientEmergencies(req.user!.id);
      return res.json(items.map(toApiDoc));
    }
    if (role === UserRole.AMBULANCE_DRIVER) {
      const items = await listDriverEmergencies(req.user!.id);
      return res.json(items.map(toApiDoc));
    }
    if (role === UserRole.PARAMEDIC || role === UserRole.AMBULANCE_NURSE) {
      const items = await listDriverEmergencies(req.user!.id);
      return res.json(items.map(toApiDoc));
    }
    if (role === UserRole.CLINIC_ADMIN) {
      const admin = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { managedFacilityId: true },
      });
      if (!admin?.managedFacilityId) {
        return res.status(400).json({ error: 'Sin clínica asignada' });
      }
      const items = await listFacilityEmergencies(admin.managedFacilityId);
      return res.json(items.map(toApiDoc));
    }
    return res.status(403).json({ error: 'Rol no autorizado' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const patchEmergencyStatus = async (req: AuthRequest, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status || !Object.values(EmergencyRequestStatus).includes(status as EmergencyRequestStatus)) {
    return res.status(400).json({ error: 'status inválido' });
  }
  try {
    const emergency = await updateEmergencyStatus(
      req.params.id,
      req.user!.id,
      req.user!.role,
      status as EmergencyRequestStatus,
    );
    res.json(toApiDoc(emergency));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const patchEmergencyLocation = async (req: AuthRequest, res: Response) => {
  const { latitude, longitude, etaMinutes } = req.body as {
    latitude?: number;
    longitude?: number;
    etaMinutes?: number;
  };
  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: 'latitude y longitude son obligatorios' });
  }
  try {
    const payload = await updateAmbulanceLocation(
      req.params.id,
      req.user!.id,
      Number(latitude),
      Number(longitude),
      etaMinutes != null ? Number(etaMinutes) : undefined,
    );
    res.json(toApiDoc(payload));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const cancelEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const emergency = await cancelEmergencyRequest(req.params.id, req.user!.id);
    res.json(toApiDoc(emergency));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const getEmergencyChatMessages = async (req: AuthRequest, res: Response) => {
  try {
    const messages = await listEmergencyMessages(req.params.id, req.user!.id);
    res.json(messages.map(toApiDoc));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const postEmergencyChatMessage = async (req: AuthRequest, res: Response) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    return res.status(400).json({ error: 'text es obligatorio' });
  }
  try {
    const message = await createEmergencyChatMessage({
      emergencyRequestId: req.params.id,
      senderId: req.user!.id,
      text,
    });
    res.status(201).json(toApiDoc(message));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const listClinicAmbulances = async (req: AuthRequest, res: Response) => {
  const adminCtx = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { managedFacilityId: true },
  });
  if (!adminCtx?.managedFacilityId) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }
  const units = await listFacilityAmbulances(adminCtx.managedFacilityId);
  res.json(units.map(toApiDoc));
};

export const postClinicAmbulance = async (req: AuthRequest, res: Response) => {
  const { plateNumber, callSign, driverId } = req.body as {
    plateNumber?: string;
    callSign?: string;
    driverId?: string;
  };
  if (!plateNumber?.trim()) {
    return res.status(400).json({ error: 'plateNumber es obligatorio' });
  }
  const adminCreate = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { managedFacilityId: true },
  });
  if (!adminCreate?.managedFacilityId) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }
  try {
    const unit = await createAmbulanceUnit({
      facilityId: adminCreate.managedFacilityId,
      plateNumber,
      callSign,
      driverId,
    });
    res.status(201).json(toApiDoc(unit));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const patchClinicAmbulance = async (req: AuthRequest, res: Response) => {
  const { plateNumber, callSign, driverId, status, isActive } = req.body as {
    plateNumber?: string;
    callSign?: string;
    driverId?: string | null;
    status?: string;
    isActive?: boolean;
  };
  const adminPatch = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { managedFacilityId: true },
  });
  if (!adminPatch?.managedFacilityId) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }
  try {
    const unit = await updateAmbulanceUnit(req.params.unitId, adminPatch.managedFacilityId, {
      plateNumber,
      callSign,
      driverId,
      status: status as AmbulanceUnitStatus | undefined,
      isActive,
    });
    res.json(toApiDoc(unit));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const getPendingRequests = async (req: AuthRequest, res: Response) => {
  try {
    const items = await listPendingFacilityRequests(req.user!.id);
    res.json(items.map(toApiDoc));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const acceptEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const emergency = await acceptEmergencyRequest(req.params.id, req.user!.id);
    res.json(toApiDoc(emergency));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};
