import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';

async function getFacilityIdForRequest(req: AuthRequest): Promise<string | null> {
  if ((req.user as any)?.managedFacilityId) {
    return (req.user as any).managedFacilityId;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
  return user?.managedFacilityId || null;
}

// ==========================================
// PACIENTE ENDPOINTS
// ==========================================

/**
 * Listar todos los equipos médicos disponibles en el sistema (activos y con stock)
 */
export const listAllEquipment = async (req: AuthRequest, res: Response) => {
  try {
    const equipments = await prisma.medicalEquipment.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(equipments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al listar equipos' });
  }
};

/**
 * Solicitar el alquiler de un equipo médico
 */
export const rentEquipment = async (req: AuthRequest, res: Response) => {
  const { equipmentId, startDate, endDate, address, phone } = req.body;
  const patientId = req.user!.id;

  if (!equipmentId || !startDate || !endDate || !address || !phone) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const equipment = await prisma.medicalEquipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      return res.status(404).json({ error: 'Equipo médico no encontrado' });
    }

    if (!equipment.isActive || equipment.stock <= 0) {
      return res.status(400).json({ error: 'El equipo seleccionado no tiene stock disponible' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Formatos de fecha inválidos' });
    }

    if (end < start) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio' });
    }

    // Calcular días
    const diffTime = Math.abs(end.getTime() - start.getTime());
    let days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (days <= 0) days = 1; // Al menos 1 día

    const totalPrice = equipment.pricePerDay * days;

    // Transacción para restar stock y crear el alquiler
    const rental = await prisma.$transaction(async (tx) => {
      // Restar stock
      await tx.medicalEquipment.update({
        where: { id: equipmentId },
        data: { stock: { decrement: 1 } },
      });

      // Crear alquiler
      return tx.equipmentRental.create({
        data: {
          patientId,
          equipmentId,
          facilityId: equipment.facilityId,
          startDate: start,
          endDate: end,
          totalPrice,
          status: 'PENDING',
          address,
          phone,
        },
        include: {
          equipment: true,
          facility: true,
        },
      });
    });

    res.status(201).json(rental);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al procesar el alquiler' });
  }
};

/**
 * Obtener el historial de alquileres del paciente autenticado
 */
export const getPatientRentals = async (req: AuthRequest, res: Response) => {
  try {
    const rentals = await prisma.equipmentRental.findMany({
      where: { patientId: req.user!.id },
      include: {
        equipment: true,
        facility: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rentals);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener alquileres' });
  }
};

// ==========================================
// CLINIC ADMIN ENDPOINTS
// ==========================================

/**
 * Obtener el inventario de la clínica del administrador
 */
export const getClinicEquipment = async (req: AuthRequest, res: Response) => {
  const facilityId = await getFacilityIdForRequest(req);

  if (!facilityId) {
    return res.status(403).json({ error: 'Usuario no tiene clínica asociada' });
  }

  try {
    const equipments = await prisma.medicalEquipment.findMany({
      where: { facilityId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(equipments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener inventario' });
  }
};

/**
 * Agregar un nuevo equipo al catálogo de la clínica
 */
export const addClinicEquipment = async (req: AuthRequest, res: Response) => {
  const facilityId = await getFacilityIdForRequest(req);
  const { name, description, pricePerDay, stock, imageUrl } = req.body;

  if (!facilityId) {
    return res.status(403).json({ error: 'Usuario no tiene clínica asociada' });
  }

  if (!name || pricePerDay == null || stock == null) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const equipment = await prisma.medicalEquipment.create({
      data: {
        facilityId,
        name,
        description,
        pricePerDay: parseFloat(pricePerDay),
        stock: parseInt(stock, 10),
        imageUrl: imageUrl || 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=200',
        isActive: true,
      },
    });
    res.status(201).json(equipment);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al agregar equipo' });
  }
};

/**
 * Actualizar un equipo médico
 */
export const updateClinicEquipment = async (req: AuthRequest, res: Response) => {
  const facilityId = await getFacilityIdForRequest(req);
  const { id } = req.params;
  const { name, description, pricePerDay, stock, imageUrl, isActive } = req.body;

  if (!facilityId) {
    return res.status(403).json({ error: 'Usuario no tiene clínica asociada' });
  }

  try {
    const existing = await prisma.medicalEquipment.findUnique({ where: { id } });

    if (!existing || existing.facilityId !== facilityId) {
      return res.status(404).json({ error: 'Equipo no encontrado o no pertenece a esta clínica' });
    }

    const updated = await prisma.medicalEquipment.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        description: description !== undefined ? description : existing.description,
        pricePerDay: pricePerDay !== undefined ? parseFloat(pricePerDay) : existing.pricePerDay,
        stock: stock !== undefined ? parseInt(stock, 10) : existing.stock,
        imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar equipo' });
  }
};

/**
 * Eliminar (lógicamente) un equipo médico
 */
export const deleteClinicEquipment = async (req: AuthRequest, res: Response) => {
  const facilityId = await getFacilityIdForRequest(req);
  const { id } = req.params;

  if (!facilityId) {
    return res.status(403).json({ error: 'Usuario no tiene clínica asociada' });
  }

  try {
    const existing = await prisma.medicalEquipment.findUnique({ where: { id } });

    if (!existing || existing.facilityId !== facilityId) {
      return res.status(404).json({ error: 'Equipo no encontrado o no pertenece a esta clínica' });
    }

    // Usamos borrado lógico para no romper relaciones con alquileres previos
    const deleted = await prisma.medicalEquipment.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: 'Equipo eliminado con éxito', deleted });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al eliminar equipo' });
  }
};

/**
 * Listar las solicitudes de alquiler recibidas por la clínica
 */
export const getClinicRentals = async (req: AuthRequest, res: Response) => {
  const facilityId = await getFacilityIdForRequest(req);

  if (!facilityId) {
    return res.status(403).json({ error: 'Usuario no tiene clínica asociada' });
  }

  try {
    const rentals = await prisma.equipmentRental.findMany({
      where: { facilityId },
      include: {
        equipment: true,
        patient: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rentals);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener solicitudes' });
  }
};

/**
 * Cambiar el estado de una solicitud de alquiler (aprobar, entregar, cancelar)
 */
export const updateRentalStatus = async (req: AuthRequest, res: Response) => {
  const facilityId = await getFacilityIdForRequest(req);
  const { id } = req.params;
  const { status } = req.body; // PENDING, ACTIVE, COMPLETED, CANCELLED

  if (!facilityId) {
    return res.status(403).json({ error: 'Usuario no tiene clínica asociada' });
  }

  if (!status) {
    return res.status(400).json({ error: 'Falta el campo status' });
  }

  try {
    const rental = await prisma.equipmentRental.findUnique({
      where: { id },
      include: { equipment: true },
    });

    if (!rental || rental.facilityId !== facilityId) {
      return res.status(404).json({ error: 'Solicitud no encontrada o no pertenece a esta clínica' });
    }

    const oldStatus = rental.status;

    // Transacción para actualizar el estado del alquiler y reponer stock si se cancela
    const updatedRental = await prisma.$transaction(async (tx) => {
      // Reponer stock si se cancela y no estaba cancelado previamente
      if (status === 'CANCELLED' && oldStatus !== 'CANCELLED') {
        await tx.medicalEquipment.update({
          where: { id: rental.equipmentId },
          data: { stock: { increment: 1 } },
        });
      }
      // Si pasa de CANCELLED a otro estado (ej. de vuelta a PENDING), restamos stock
      else if (oldStatus === 'CANCELLED' && status !== 'CANCELLED') {
        await tx.medicalEquipment.update({
          where: { id: rental.equipmentId },
          data: { stock: { decrement: 1 } },
        });
      }

      return tx.equipmentRental.update({
        where: { id },
        data: { status },
        include: {
          equipment: true,
          patient: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    });

    res.json(updatedRental);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar el estado del alquiler' });
  }
};
