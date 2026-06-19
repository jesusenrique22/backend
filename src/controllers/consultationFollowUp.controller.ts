import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  listDoctorFollowUps,
  listPatientFollowUps,
} from '../services/consultationFollowUp.service';

export const getDoctorConsultationFollowUps = async (req: AuthRequest, res: Response) => {
  const items = await listDoctorFollowUps(req.user!.id);
  res.json(items);
};

export const getPatientConsultationFollowUps = async (req: AuthRequest, res: Response) => {
  const items = await listPatientFollowUps(req.user!.id);
  res.json(items);
};
