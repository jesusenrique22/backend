import { Router } from 'express';
import {
  listAllEquipment,
  rentEquipment,
  getPatientRentals,
  getClinicEquipment,
  addClinicEquipment,
  updateClinicEquipment,
  deleteClinicEquipment,
  getClinicRentals,
  updateRentalStatus,
} from '../controllers/equipment.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// ==========================================
// PACIENTE ROUTES
// ==========================================
router.get('/', authenticate, authorize(UserRole.PATIENT), listAllEquipment);
router.post('/rent', authenticate, authorize(UserRole.PATIENT), rentEquipment);
router.get('/my-rentals', authenticate, authorize(UserRole.PATIENT), getPatientRentals);

// ==========================================
// CLINIC ADMIN ROUTES
// ==========================================
router.get('/clinic', authenticate, authorize(UserRole.CLINIC_ADMIN), getClinicEquipment);
router.post('/clinic', authenticate, authorize(UserRole.CLINIC_ADMIN), addClinicEquipment);
router.put('/clinic/:id', authenticate, authorize(UserRole.CLINIC_ADMIN), updateClinicEquipment);
router.delete('/clinic/:id', authenticate, authorize(UserRole.CLINIC_ADMIN), deleteClinicEquipment);
router.get('/clinic/rentals', authenticate, authorize(UserRole.CLINIC_ADMIN), getClinicRentals);
router.patch('/clinic/rentals/:id/status', authenticate, authorize(UserRole.CLINIC_ADMIN), updateRentalStatus);

export default router;
