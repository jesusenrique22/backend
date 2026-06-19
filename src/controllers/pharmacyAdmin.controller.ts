import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { UserRole, PharmacyOrderStatus } from '../types/enums';
import { createStaffUser } from '../services/staffUser.service';
import { sanitizeUser } from '../utils/sanitizeUser';
import { toApiDoc } from '../utils/apiDoc';

async function getPharmacyAdminContext(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pharmacyId) return null;
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: user.pharmacyId } });
  return { user, pharmacy };
}

function staffRolesForPharmacyAdmin() {
  return [UserRole.PHARMACIST, UserRole.PHARMACY_CASHIER];
}

export const getMyContext = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx) {
    return res.status(400).json({ error: 'Administrador sin farmacia asignada' });
  }
  res.json({
    user: sanitizeUser(ctx.user),
    pharmacy: ctx.pharmacy ? toApiDoc(ctx.pharmacy) : null,
  });
};

export const getStats = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }
  const pharmacyId = ctx.pharmacy.id;
  const [products, orders, pendingReview] = await Promise.all([
    prisma.pharmacyProduct.count({ where: { pharmacyId } }),
    prisma.pharmacyOrder.count({ where: { pharmacyId } }),
    prisma.pharmacyOrder.count({
      where: { pharmacyId, status: PharmacyOrderStatus.PENDING },
    }),
  ]);
  res.json({ products, orders, pendingReview });
};

export const createStaff = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const { name, email, phone, role } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nombre y correo son obligatorios' });
  }
  if (!staffRolesForPharmacyAdmin().includes(role)) {
    return res.status(400).json({
      error: 'Rol inválido. Use PHARMACIST o PHARMACY_CASHIER',
    });
  }

  try {
    const result = await createStaffUser({
      name,
      email,
      phone,
      role,
      createdBy: req.user!.id,
      pharmacyId: ctx.pharmacy.id,
    });
    res.status(201).json(result);
  } catch (e) {
    const message = (e as Error).message;
    res.status(message.includes('ya está') ? 409 : 400).json({ error: message });
  }
};

export const listStaff = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const staff = await prisma.user.findMany({
    where: {
      pharmacyId: ctx.pharmacy.id,
      role: { in: staffRolesForPharmacyAdmin() },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(staff.map(sanitizeUser));
};

export const listProducts = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const products = await prisma.pharmacyProduct.findMany({
    where: { pharmacyId: ctx.pharmacy.id },
    orderBy: { name: 'asc' },
  });
  res.json(products.map(toApiDoc));
};

export const createProduct = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const product = await prisma.pharmacyProduct.create({
    data: { ...req.body, pharmacyId: ctx.pharmacy.id },
  });
  res.status(201).json(toApiDoc(product));
};

export const updateProduct = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const existing = await prisma.pharmacyProduct.findFirst({
    where: { id: req.params.id, pharmacyId: ctx.pharmacy.id },
  });
  if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

  const product = await prisma.pharmacyProduct.update({
    where: { id: existing.id },
    data: req.body,
  });
  res.json(toApiDoc(product));
};

export const deleteProduct = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
  if (!ctx?.pharmacy) {
    return res.status(400).json({ error: 'Sin farmacia asignada' });
  }

  const result = await prisma.pharmacyProduct.deleteMany({
    where: { id: req.params.id, pharmacyId: ctx.pharmacy.id },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ message: 'Producto eliminado' });
};

export const listOrders = async (req: AuthRequest, res: Response) => {
  const ctx = await getPharmacyAdminContext(req.user!.id);
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
