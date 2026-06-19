import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createDoctorConsultationTemplate,
  deleteDoctorConsultationTemplate,
  listDoctorConsultationTemplates,
  ConsultationTemplateInput,
} from '../services/consultationTemplate.service';

export const listMyConsultationTemplates = async (req: AuthRequest, res: Response) => {
  const templates = await listDoctorConsultationTemplates(req.user!.id);
  res.json(templates);
};

export const createMyConsultationTemplate = async (req: AuthRequest, res: Response) => {
  const body = req.body as ConsultationTemplateInput;
  try {
    const created = await createDoctorConsultationTemplate(req.user!.id, body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export const deleteMyConsultationTemplate = async (req: AuthRequest, res: Response) => {
  try {
    await deleteDoctorConsultationTemplate(req.user!.id, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    res.status(msg.includes('no encontrada') ? 404 : 400).json({ error: msg });
  }
};
