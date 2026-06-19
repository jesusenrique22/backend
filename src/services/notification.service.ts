import { prisma } from '../lib/prisma';
import { AppointmentStatus, UserRole } from '../types/enums';
import { formatApptWhen } from '../utils/appTimezone';
import { appointmentNeedsClosure } from './consultationReport.service';
import { emitToUser } from '../socket/realtimeGatewayClient';

export const NotificationCategory = {
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  CLINIC_INVITATION: 'CLINIC_INVITATION',
  CONSULTATION_CLOSURE: 'CONSULTATION_CLOSURE',
  SYSTEM: 'SYSTEM',
} as const;

function reminderCopy(
  msUntil: number,
  otherName: string,
  when: string,
  isDoctor: boolean,
): {
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ALERT';
} {
  const hours = msUntil / (1000 * 60 * 60);
  const prefix = isDoctor ? `Cita con ${otherName}` : `Cita con ${otherName}`;

  if (hours <= 2) {
    const mins = Math.max(1, Math.round(msUntil / 60000));
    const timeLabel =
      mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
    return {
      title: '¡Tu cita es pronto!',
      message: `${prefix} en ${timeLabel} (${when}).`,
      type: 'ALERT',
    };
  }
  if (hours <= 24) {
    return {
      title: 'Cita mañana',
      message: `${prefix} — ${when}.`,
      type: 'WARNING',
    };
  }
  if (hours <= 72) {
    const days = Math.ceil(hours / 24);
    return {
      title: 'Recordatorio de cita',
      message: `En ${days} día${days === 1 ? '' : 's'}: ${prefix} (${when}).`,
      type: 'INFO',
    };
  }
  return {
    title: 'Cita agendada',
    message: `${prefix} el ${when}.`,
    type: 'INFO',
  };
}

export async function syncAppointmentReminders(userId: string, role: UserRole): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const filter: {
    status: { notIn: string[] };
    dateTime: { gt: Date; lte: Date };
    patientId?: string;
    doctorId?: string;
  } = {
    status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED] },
    dateTime: { gt: now, lte: horizon },
  };

  if (role === UserRole.PATIENT) {
    filter.patientId = userId;
  } else if (role === UserRole.DOCTOR) {
    filter.doctorId = userId;
  } else {
    return;
  }

  const appointments = await prisma.appointment.findMany({
    where: filter,
    include: {
      doctor: { select: { name: true } },
      patient: { select: { name: true } },
    },
    orderBy: { dateTime: 'asc' },
  });

  const activeIds = new Set<string>();

  for (const appt of appointments) {
    const apptId = appt.id;
    activeIds.add(apptId);
    const when = formatApptWhen(appt.dateTime);
    const msUntil = appt.dateTime.getTime() - now.getTime();
    const isDoctor = role === UserRole.DOCTOR;
    const otherName = isDoctor ? (appt.patient?.name ?? 'paciente') : (appt.doctor?.name ?? 'tu médico');
    const { title, message, type } = reminderCopy(msUntil, otherName, when, isDoctor);

    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        category: 'APPOINTMENT_REMINDER',
        relatedId: apptId,
      },
    });

    if (existing) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: { title, message, type, relatedPath: '/appointments' },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId,
          category: 'APPOINTMENT_REMINDER',
          relatedId: apptId,
          title,
          message,
          type,
          relatedPath: '/appointments',
          isRead: false,
        },
      });
    }
  }

  await prisma.notification.deleteMany({
    where: {
      userId,
      category: 'APPOINTMENT_REMINDER',
      ...(activeIds.size > 0 ? { relatedId: { notIn: [...activeIds] } } : {}),
    },
  });
}

/** Informes de consulta pendientes (solo médico). Se muestran primero en la bandeja. */
export async function syncConsultationClosureReminders(doctorId: string): Promise<void> {
  const now = new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED] },
      consultationReport: { is: null },
    },
    include: {
      patient: { select: { name: true } },
    },
    orderBy: { dateTime: 'asc' },
  });

  const activeIds = new Set<string>();

  for (const appt of appointments) {
    if (!appointmentNeedsClosure({ ...appt, consultationReport: null }, now)) continue;
    activeIds.add(appt.id);
    const patientName = appt.patient?.name ?? 'paciente';
    const title = 'Informe de consulta pendiente';
    const message = `${patientName} · Completa receta, diagnóstico e instrucciones`;

    const existing = await prisma.notification.findFirst({
      where: {
        userId: doctorId,
        category: NotificationCategory.CONSULTATION_CLOSURE,
        relatedId: appt.id,
      },
    });

    if (existing) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title,
          message,
          type: 'WARNING',
          relatedPath: '/consultation-closure',
          isRead: false,
        },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: doctorId,
          category: NotificationCategory.CONSULTATION_CLOSURE,
          relatedId: appt.id,
          title,
          message,
          type: 'WARNING',
          relatedPath: '/consultation-closure',
          isRead: false,
        },
      });
      emitToUser(doctorId, 'notification:new', {
        category: NotificationCategory.CONSULTATION_CLOSURE,
        title,
        relatedId: appt.id,
      });
    }
  }

  const removed = await prisma.notification.deleteMany({
    where: {
      userId: doctorId,
      category: NotificationCategory.CONSULTATION_CLOSURE,
      ...(activeIds.size > 0 ? { relatedId: { notIn: [...activeIds] } } : {}),
    },
  });

  if (removed.count > 0) {
    emitToUser(doctorId, 'notification:new', {
      category: NotificationCategory.CONSULTATION_CLOSURE,
      refresh: true,
    });
  }
}

export async function dismissConsultationClosureReminder(
  doctorId: string,
  appointmentId: string,
): Promise<void> {
  const deleted = await prisma.notification.deleteMany({
    where: {
      userId: doctorId,
      category: NotificationCategory.CONSULTATION_CLOSURE,
      relatedId: appointmentId,
    },
  });
  if (deleted.count > 0) {
    emitToUser(doctorId, 'notification:new', {
      category: NotificationCategory.CONSULTATION_CLOSURE,
      refresh: true,
      relatedId: appointmentId,
    });
  }
}

export function sortNotificationsForInbox<
  T extends { isRead: boolean; category: string; updatedAt: Date; createdAt: Date },
>(rows: T[]): T[] {
  const priority = (n: T) => {
    if (!n.isRead && n.category === NotificationCategory.CONSULTATION_CLOSURE) return 0;
    if (!n.isRead) return 1;
    if (n.category === NotificationCategory.CONSULTATION_CLOSURE) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    const bu = b.updatedAt.getTime();
    const au = a.updatedAt.getTime();
    if (bu !== au) return bu - au;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function createChatNotification(params: {
  recipientId: string;
  senderId: string;
  senderName: string;
  text: string;
  conversationId: string;
}): Promise<void> {
  const preview =
    params.text.length > 120 ? `${params.text.slice(0, 117)}...` : params.text;

  await prisma.notification.create({
    data: {
      userId: params.recipientId,
      title: `Mensaje de ${params.senderName}`,
      message: preview,
      type: 'INFO',
      category: 'CHAT_MESSAGE',
      relatedPath: '/messages',
      relatedId: params.conversationId,
      isRead: false,
    },
  });
}

export async function getSenderName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? 'Usuario';
}
