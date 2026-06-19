import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createDoctorByAdmin } from '../services/adminDoctor.service';
import {
  listDoctorsForFacility,
  listDoctorsNotInFacility,
  removeDoctorFromFacility,
} from '../services/clinicDoctorAssignment.service';
import { ClinicInvitationStatus } from '../models/ClinicInvitation';
import { inviteDoctorToFacility } from '../services/clinicInvitation.service';
import { emitToFacility } from '../socket/realtimeGatewayClient';
import { sanitizeUser } from '../utils/sanitizeUser';
import { toApiDoc } from '../utils/apiDoc';
import { UserRole } from '../types/enums';
import { createStaffUser } from '../services/staffUser.service';
import {
  createAmbulanceUnit,
  listFacilityAmbulances,
  updateAmbulanceUnit,
} from '../services/emergency.service';
import { AmbulanceUnitStatus } from '../types/enums';

async function getClinicAdminContext(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.managedFacilityId) {
    return null;
  }
  const facility = await prisma.medicalFacility.findUnique({
    where: { id: user.managedFacilityId },
  });
  return { user, facility };
}

export const getMyContext = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx) {
    return res.status(400).json({ error: 'Administrador de clínica sin sede asignada' });
  }
  res.json({
    user: sanitizeUser(ctx.user),
    facility: ctx.facility ? toApiDoc(ctx.facility) : null,
  });
};

export const getDashboard = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const facilityId = ctx.facility.id;
  const doctors = await listDoctorsForFacility(facilityId);
  const doctorUserIds = doctors.map((d) => d.user?.id).filter((id): id is string => Boolean(id));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let appointmentsToday = 0;
  if (doctorUserIds.length) {
    appointmentsToday = await prisma.appointment.count({
      where: {
        doctorId: { in: doctorUserIds },
        dateTime: { gte: today, lt: tomorrow },
        status: { not: 'CANCELLED' },
      },
    });
  }

  const pendingInvitations = await prisma.clinicInvitation.findMany({
    where: { facilityId: ctx.facility.id, status: ClinicInvitationStatus.PENDING },
    include: {
      doctor: { select: { id: true, name: true, email: true, phone: true, profilePic: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    facility: toApiDoc(ctx.facility),
    stats: {
      doctorsCount: doctors.length,
      appointmentsToday,
      pendingInvitationsCount: pendingInvitations.length,
    },
    doctors,
    pendingInvitations: pendingInvitations.map((inv) => ({
      id: inv.id,
      doctor: inv.doctor ? toApiDoc(inv.doctor) : null,
      createdAt: inv.createdAt,
    })),
  });
};

export const listDoctors = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }
  const doctors = await listDoctorsForFacility(ctx.facility.id);
  res.json(doctors);
};

export const listAssignableDoctors = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }
  const search = req.query.search as string | undefined;
  const doctors = await listDoctorsNotInFacility(ctx.facility.id, search);
  res.json(doctors);
};

export const assignDoctor = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { doctorUserId } = req.body;
  if (!doctorUserId) {
    return res.status(400).json({ error: 'doctorUserId es obligatorio' });
  }

  try {
    const result = await inviteDoctorToFacility(doctorUserId, ctx.facility.id, req.user!.id);
    res.status(200).json({
      invitationId: result.invitation.id,
      facilityName: result.facility.name,
      doctorName: result.doctor.name,
      message: `Invitación enviada a ${result.doctor.name}. El médico debe aceptarla para unirse a ${result.facility.name}.`,
    });
  } catch (e) {
    const message = (e as Error).message;
    res.status(400).json({ error: message });
  }
};

export const unassignDoctor = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { doctorUserId } = req.params;
  if (!doctorUserId) {
    return res.status(400).json({ error: 'doctorUserId es obligatorio' });
  }

  const deleteAccount =
    req.query.deleteAccount === 'true' ||
    req.query.deleteAccount === '1' ||
    req.body?.deleteAccount === true;

  try {
    const result = await removeDoctorFromFacility(doctorUserId, ctx.facility.id, {
      deleteIfLastFacility: deleteAccount,
    });
    emitToFacility(ctx.facility.id, 'clinic:roster:updated', {
      reason: result.action === 'deleted' ? 'doctor_deleted' : 'doctor_unassigned',
      facilityId: ctx.facility.id,
      doctorUserId,
    });
    res.json({
      action: result.action,
      profile: result.action === 'unassigned' ? result.profile : undefined,
      message:
        result.action === 'deleted'
          ? 'Cuenta de médico eliminada del sistema'
          : 'Médico desvinculado de la clínica',
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const createDoctor = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { name, email, phone, documentId, specialtyId } = req.body;
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !documentId?.trim()) {
    return res.status(400).json({
      error: 'Nombre, correo, teléfono y cédula son obligatorios',
    });
  }
  if (!specialtyId) {
    return res.status(400).json({ error: 'La especialidad es obligatoria' });
  }

  const facilityId = ctx.facility.id;

  try {
    const result = await createDoctorByAdmin({
      name,
      email,
      phone,
      documentId,
      specialtyId,
      facilityIds: [facilityId],
      allowedFacilityIds: [facilityId],
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

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

const AMBULANCE_CREW_ROLES = [
  UserRole.AMBULANCE_DRIVER,
  UserRole.PARAMEDIC,
  UserRole.AMBULANCE_NURSE,
] as const;

function facilityAmbulanceStaffWhere(facilityId: string, role: UserRole) {
  return {
    role,
    isActive: true,
    OR: [
      { managedFacilityId: facilityId },
      { ambulanceUnitsAsDriver: { some: { facilityId } } },
      { ambulanceUnitsAsParamedic: { some: { facilityId } } },
      { ambulanceUnitsAsNurse: { some: { facilityId } } },
    ],
  };
}

export const listAmbulanceDrivers = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const drivers = await prisma.user.findMany({
    where: facilityAmbulanceStaffWhere(ctx.facility.id, UserRole.AMBULANCE_DRIVER),
    select: { id: true, name: true, email: true, phone: true, profilePic: true, role: true },
    orderBy: { name: 'asc' },
  });

  res.json(drivers.map(toApiDoc));
};

export const listAmbulanceStaff = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const roleParam = String(req.query.role ?? '').toUpperCase();
  const roles = roleParam
    ? AMBULANCE_CREW_ROLES.filter((r) => r === roleParam)
    : [...AMBULANCE_CREW_ROLES];

  if (roleParam && roles.length === 0) {
    return res.status(400).json({ error: 'Rol de personal inválido' });
  }

  const staff = await prisma.user.findMany({
    where: {
      role: { in: [...roles] },
      isActive: true,
      OR: [
        { managedFacilityId: ctx.facility.id },
        { ambulanceUnitsAsDriver: { some: { facilityId: ctx.facility.id } } },
        { ambulanceUnitsAsParamedic: { some: { facilityId: ctx.facility.id } } },
        { ambulanceUnitsAsNurse: { some: { facilityId: ctx.facility.id } } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true, profilePic: true, role: true },
    orderBy: { name: 'asc' },
  });

  res.json(staff.map(toApiDoc));
};

export const createAmbulanceStaff = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { name, email, phone, role } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  };

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nombre y correo son obligatorios' });
  }

  const staffRole = String(role ?? UserRole.AMBULANCE_DRIVER).toUpperCase() as UserRole;
  if (!AMBULANCE_CREW_ROLES.includes(staffRole as (typeof AMBULANCE_CREW_ROLES)[number])) {
    return res.status(400).json({ error: 'Rol de personal inválido' });
  }

  try {
    const result = await createStaffUser({
      name,
      email,
      phone,
      role: staffRole,
      managedFacilityId: ctx.facility.id,
      createdBy: req.user!.id,
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

export const createAmbulanceDriver = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { name, email, phone } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
  };

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nombre y correo son obligatorios' });
  }

  try {
    const result = await createStaffUser({
      name,
      email,
      phone,
      role: UserRole.AMBULANCE_DRIVER,
      managedFacilityId: ctx.facility.id,
      createdBy: req.user!.id,
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

export const listAmbulances = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }
  const units = await listFacilityAmbulances(ctx.facility.id);
  res.json(units.map(toApiDoc));
};

export const createAmbulance = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { plateNumber, callSign, driverId, paramedicId, nurseId, latitude, longitude } =
    req.body as {
      plateNumber?: string;
      callSign?: string;
      driverId?: string;
      paramedicId?: string;
      nurseId?: string;
      latitude?: number;
      longitude?: number;
    };

  if (!plateNumber?.trim()) {
    return res.status(400).json({ error: 'plateNumber es obligatorio' });
  }

  try {
    const unit = await createAmbulanceUnit({
      facilityId: ctx.facility.id,
      plateNumber,
      callSign,
      driverId,
      paramedicId,
      nurseId,
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
    });
    res.status(201).json(toApiDoc(unit));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const patchAmbulance = async (req: AuthRequest, res: Response) => {
  const ctx = await getClinicAdminContext(req.user!.id);
  if (!ctx?.facility) {
    return res.status(400).json({ error: 'Sin clínica asignada' });
  }

  const { plateNumber, callSign, driverId, paramedicId, nurseId, status, isActive, latitude, longitude } =
    req.body as {
      plateNumber?: string;
      callSign?: string;
      driverId?: string | null;
      paramedicId?: string | null;
      nurseId?: string | null;
      status?: string;
      isActive?: boolean;
      latitude?: number;
      longitude?: number;
    };

  try {
    const unit = await updateAmbulanceUnit(req.params.unitId, ctx.facility!.id, {
      plateNumber,
      callSign,
      driverId,
      paramedicId,
      nurseId,
      status: status as AmbulanceUnitStatus | undefined,
      isActive,
    });

    if (latitude != null && longitude != null) {
      await prisma.ambulanceUnit.update({
        where: { id: unit.id },
        data: { latitude: Number(latitude), longitude: Number(longitude) },
      });
    }

    const fresh = await prisma.ambulanceUnit.findUnique({
      where: { id: unit.id },
      include: {
        driver: { select: { id: true, name: true, phone: true, profilePic: true } },
        paramedic: { select: { id: true, name: true, phone: true, profilePic: true } },
        nurse: { select: { id: true, name: true, phone: true, profilePic: true } },
      },
    });
    if (!fresh) {
      return res.status(404).json({ error: 'Unidad no encontrada' });
    }
    res.json(toApiDoc(fresh));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};
