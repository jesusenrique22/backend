import { Router } from 'express';
import {
  getMyContext,
  getStats,
  createStaff,
  listStaff,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listOrders,
} from '../controllers/pharmacyAdmin.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

router.use(authenticate, authorize(UserRole.PHARMACY_ADMIN));

router.get('/me', getMyContext);
router.get('/stats', getStats);
router.post('/staff', createStaff);
router.get('/staff', listStaff);
router.get('/products', listProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
router.get('/orders', listOrders);

export default router;
