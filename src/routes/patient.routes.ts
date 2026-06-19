import { Router } from 'express';
import {
  getMyProfile,
  updateMyProfile,
  getMyMedicalHistory,
  getMyAppointments,
} from '../controllers/patient.controller';
import { getPatientConsultationFollowUps } from '../controllers/consultationFollowUp.controller';
import {
  deleteMyMedicalDocument,
  listMyMedicalDocuments,
  uploadMyMedicalDocument,
} from '../controllers/medicalDocument.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

router.use(authenticate, authorize(UserRole.PATIENT));

router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);
router.get('/medical-history', getMyMedicalHistory);
router.get('/medical-documents', listMyMedicalDocuments);
router.post('/medical-documents', uploadMyMedicalDocument);
router.delete('/medical-documents/:id', deleteMyMedicalDocument);
router.get('/appointments', getMyAppointments);
router.get('/consultation-follow-ups', getPatientConsultationFollowUps);

export default router;
