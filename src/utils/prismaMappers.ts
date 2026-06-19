import { Prisma } from '@prisma/client';
import {
  appointmentNeedsClosure,
  mapConsultationReport,
} from '../services/consultationReport.service';
import { toApiDoc } from './apiDoc';

export const doctorProfileInclude = {
  specialties: { include: { specialty: true } },
  facilities: { include: { facility: true } },
  specialtyDurations: true,
} satisfies Prisma.DoctorProfileInclude;

export type DoctorProfileWithRelations = Prisma.DoctorProfileGetPayload<{
  include: typeof doctorProfileInclude;
}>;

export function mapDoctorProfile(profile: DoctorProfileWithRelations) {
  const specialtyIds = profile.specialties.map((s) => toApiDoc(s.specialty));
  const facilityIds = profile.facilities.map((f) => toApiDoc(f.facility));
  return toApiDoc({
    ...profile,
    specialtyIds,
    facilityIds,
    specialtyConsultationDurations: profile.specialtyDurations.map((d) => ({
      specialtyId: d.specialtyId,
      durationMinutes: d.durationMinutes,
    })),
  });
}

export const appointmentInclude = {
  patient: {
    select: { id: true, name: true, email: true, profilePic: true, phone: true, role: true },
  },
  doctor: {
    select: { id: true, name: true, email: true, profilePic: true, phone: true, role: true },
  },
  facility: true,
  specialty: true,
  consultationReport: true,
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

export function mapAppointment(appointment: AppointmentWithRelations) {
  const { consultationReport, ...rest } = appointment;

  return toApiDoc({
    ...rest,
    patientId: appointment.patient ? toApiDoc(appointment.patient) : appointment.patientId,
    doctorId: appointment.doctor ? toApiDoc(appointment.doctor) : appointment.doctorId,
    facilityId: appointment.facility ? toApiDoc(appointment.facility) : appointment.facilityId,
    specialtyId: appointment.specialty ? toApiDoc(appointment.specialty) : appointment.specialtyId,
    consultationReport: consultationReport
      ? mapConsultationReport(consultationReport)
      : null,
    needsClosure: appointmentNeedsClosure(appointment),
  });
}

export function mapMedicalHistory(
  history: Prisma.MedicalHistoryGetPayload<{ include: { entries: { include: { doctor: true } } } }>,
) {
  return toApiDoc({
    ...history,
    entries: history.entries.map((e) =>
      toApiDoc({
        ...e,
        doctorId: e.doctor ? toApiDoc(e.doctor) : e.doctorId,
      }),
    ),
  });
}

export function mapChatConversation(
  conv: Prisma.ChatConversationGetPayload<{
    include: { doctor: true; patient: true };
  }>,
) {
  return toApiDoc({
    ...conv,
    doctorId: conv.doctor ? toApiDoc(conv.doctor) : conv.doctorId,
    patientId: conv.patient ? toApiDoc(conv.patient) : conv.patientId,
  });
}

export function mapChatMessage(
  msg: Prisma.ChatMessageGetPayload<{ include: { sender: true } }>,
) {
  return toApiDoc({
    ...msg,
    senderId: msg.sender ? toApiDoc(msg.sender) : msg.senderId,
  });
}

export function mapWorkSchedule(
  s: Prisma.DoctorWorkScheduleGetPayload<{ include: { facility: true } }>,
) {
  return toApiDoc({
    ...s,
    facilityId: s.facility ? toApiDoc(s.facility) : s.facilityId,
  });
}
