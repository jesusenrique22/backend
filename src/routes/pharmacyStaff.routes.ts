import { Router } from 'express';
import {
  getMyContext,
  listOrders,
  updateOrderStatus,
} from '../controllers/pharmacyStaff.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

router.use(
  authenticate,
  authorize(UserRole.PHARMACY_ADMIN, UserRole.PHARMACIST, UserRole.PHARMACY_CASHIER),
);

router.get('/me', getMyContext);
router.get('/orders', listOrders);
router.patch('/orders/:id', updateOrderStatus);

export default router;
