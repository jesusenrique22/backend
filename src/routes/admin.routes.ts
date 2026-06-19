import { Router } from 'express';
import {
  listUsers,
  getStats,
  createFacility,
  createSpecialty,
  listDoctors,
} from '../controllers/admin.controller';
import { authenticate, authorizeSuperAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate, authorizeSuperAdmin());

router.get('/users', listUsers);
router.get('/stats', getStats);
router.post('/facilities', createFacility);
router.post('/specialties', createSpecialty);
router.get('/doctors', listDoctors);

export default router;
