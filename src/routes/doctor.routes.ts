import { Router } from 'express';
import { listPatientMedicalDocuments } from '../controllers/medicalDocument.controller';
import {
  deleteMyConsultationTemplate,
  createMyConsultationTemplate,
  listMyConsultationTemplates,
} from '../controllers/consultationTemplate.controller';
import { getDoctorConsultationFollowUps } from '../controllers/consultationFollowUp.controller';
import {
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
  getMySchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getMyAppointments,
  updateAppointmentStatus,
  getPatientMedicalHistory,
  addMedicalHistoryEntry,
  getMyPatients,
  updatePatientWeightControls,
  acceptClinicInvitation,
  rejectClinicInvitation,
  addMySpecialty,
  createAndAddMySpecialty,
  removeMySpecialty,
  updateMySpecialtyDuration,
  patchMyProfileDetails,
} from '../controllers/doctor.controller';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

router.use(authenticate, authorize(UserRole.DOCTOR));

router.get('/profile', getMyProfile);
router.put('/profile', updateMyProfile);
router.patch('/profile', patchMyProfileDetails);
router.patch('/profile/password', changeMyPassword);
router.post('/profile/specialties', addMySpecialty);
router.post('/profile/specialties/new', createAndAddMySpecialty);
router.delete('/profile/specialties/:specialtyId', removeMySpecialty);
router.patch('/profile/specialties/:specialtyId/duration', updateMySpecialtyDuration);
router.get('/schedules', getMySchedules);
router.post('/schedules', createSchedule);
router.put('/schedules/:id', updateSchedule);
router.delete('/schedules/:id', deleteSchedule);
router.get('/appointments', getMyAppointments);
router.patch('/appointments/:id', updateAppointmentStatus);
router.get('/consultation-templates', listMyConsultationTemplates);
router.post('/consultation-templates', createMyConsultationTemplate);
router.delete('/consultation-templates/:id', deleteMyConsultationTemplate);
router.get('/consultation-follow-ups', getDoctorConsultationFollowUps);
router.get('/patients', getMyPatients);
router.get('/patients/:patientId/medical-history', getPatientMedicalHistory);
router.get('/patients/:patientId/medical-documents', listPatientMedicalDocuments);
router.post('/patients/:patientId/medical-history/entries', addMedicalHistoryEntry);
router.put('/patients/:patientId/weight-controls', updatePatientWeightControls);
router.post('/clinic-invitations/:id/accept', acceptClinicInvitation);
router.post('/clinic-invitations/:id/reject', rejectClinicInvitation);

export default router;
