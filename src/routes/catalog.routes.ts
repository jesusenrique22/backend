import { Router } from 'express';
import {
  listSpecialties,
  listFacilities,
  listLaboratories,
  listDoctors,
  listMapPois,
  doctorAvailability,
} from '../controllers/catalog.controller';

const router = Router();

router.get('/specialties', listSpecialties);
router.get('/facilities', listFacilities);
router.get('/laboratories', listLaboratories);
router.get('/map-pois', listMapPois);
router.get('/doctors', listDoctors);
router.get('/doctors/:doctorId/availability', doctorAvailability);

export default router;
