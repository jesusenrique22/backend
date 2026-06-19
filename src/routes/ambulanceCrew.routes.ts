import { Router } from 'express';
import {
  changeMyAmbulanceCrewPassword,
  getMyAmbulanceCrewProfile,
  patchMyAmbulanceCrewProfile,
} from '../controllers/ambulanceCrew.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

router.use(
  authenticate,
  authorize(UserRole.AMBULANCE_DRIVER, UserRole.PARAMEDIC, UserRole.AMBULANCE_NURSE),
);

router.get('/me', getMyAmbulanceCrewProfile);
router.patch('/me', patchMyAmbulanceCrewProfile);
router.patch('/me/password', changeMyAmbulanceCrewPassword);

export default router;
