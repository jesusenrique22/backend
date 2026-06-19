import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { syncAppointmentReminders, syncConsultationClosureReminders, sortNotificationsForInbox } from '../services/notification.service';
import { UserRole } from '../types/enums';
import { toApiDoc } from '../utils/apiDoc';

export const listMyNotifications = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  await syncAppointmentReminders(userId, role);
  if (role === UserRole.DOCTOR) {
    await syncConsultationClosureReminders(userId);
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    take: 50,
  });

  res.json(sortNotificationsForInbox(notifications).map(toApiDoc));
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  const existing = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!existing) return res.status(404).json({ error: 'Notificación no encontrada' });
  if (existing.category === 'CONSULTATION_CLOSURE') {
    return res.json(toApiDoc(existing));
  }

  const notification = await prisma.notification.update({
    where: { id: existing.id },
    data: { isRead: true },
  });
  res.json(toApiDoc(notification));
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: {
      userId: req.user!.id,
      isRead: false,
      category: { not: 'CONSULTATION_CLOSURE' },
    },
    data: { isRead: true },
  });
  res.json({ message: 'Todas marcadas como leídas' });
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  await syncAppointmentReminders(req.user!.id, req.user!.role);
  if (req.user!.role === UserRole.DOCTOR) {
    await syncConsultationClosureReminders(req.user!.id);
  }
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  res.json({ count });
};
