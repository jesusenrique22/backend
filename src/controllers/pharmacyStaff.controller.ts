import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { PharmacyOrderStatus } from '../types/enums';
import { sanitizeUser } from '../utils/sanitizeUser';
import { toApiDoc } from '../utils/apiDoc';

async function getPharmacyStaffContext(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pharmacyId) return null;
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: user.pharmacyId } });
  return { user, pharmacy };
}

export const getMyContext = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyStaffContext(req.user!.id);
  if (!ctx) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }
  res.json({
    user: sanitizeUser(ctx.user),
    pharmacy: ctx.pharmacy ? toApiDoc(ctx.pharmacy) : null,
  });
};

export const listOrders = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyStaffContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const orders = await prisma.pharmacyOrder.findMany({
    where: { pharmacyId: ctx.pharmacy.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(orders.map(toApiDoc));
};

export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyStaffContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const { status } = req.body;
  if (!Object.values(PharmacyOrderStatus).includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const order = await prisma.pharmacyOrder.findFirst({
    where: { id: req.params.id, pharmacyId: ctx.pharmacy.id },
  });
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  const updated = await prisma.pharmacyOrder.update({
    where: { id: order.id },
    data: { status },
  });
  res.json(toApiDoc(updated));
};
