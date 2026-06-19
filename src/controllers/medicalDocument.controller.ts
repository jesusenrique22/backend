import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { toApiDoc } from '../utils/apiDoc';
import {
  deleteMedicalFile,
  saveBase64MedicalFile,
} from '../services/medicalDocumentStorage.service';

const VALID_CATEGORIES = new Set(['LAB', 'RADIOLOGY', 'PRESCRIPTION', 'OTHER']);

async function assertDoctorPatientRelation(doctorId: string, patientId: string) {
  const hasRelation = await prisma.appointment.findFirst({
    where: { doctorId, patientId },
    select: { id: true },
  });
  if (!hasRelation) {
    throw new Error('Solo puedes ver documentos de pacientes que hayas atendido');
  }
}

export const uploadMyMedicalDocument = async (req: AuthRequest, res: Response) => {
  const { category, title, notes, fileName, mimeType, dataBase64 } = req.body as {
    category?: string;
    title?: string;
    notes?: string;
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  };

  const cat = (category ?? 'OTHER').toUpperCase();
  if (!VALID_CATEGORIES.has(cat)) {
    return res.status(400).json({ error: 'Categoría inválida' });
  }
  if (!title?.trim()) {
    return res.status(400).json({ error: 'El título es obligatorio' });
  }
  if (!dataBase64?.trim() || !mimeType?.trim()) {
    return res.status(400).json({ error: 'Archivo requerido' });
  }

  try {
    const stored = saveBase64MedicalFile(
      dataBase64.trim(),
      mimeType.trim(),
      fileName?.trim() || 'documento',
    );
    const doc = await prisma.patientMedicalDocument.create({
      data: {
        patientId: req.user!.id,
        category: cat,
        title: title.trim(),
        notes: notes?.trim() || null,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileUrl: stored.fileUrl,
        fileSize: stored.fileSize,
      },
    });
    res.status(201).json(toApiDoc(doc));
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
};

export const listMyMedicalDocuments = async (req: AuthRequest, res: Response) => {
  const docs = await prisma.patientMedicalDocument.findMany({
    where: { patientId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs.map(toApiDoc));
};

export const deleteMyMedicalDocument = async (req: AuthRequest, res: Response) => {
  const doc = await prisma.patientMedicalDocument.findFirst({
    where: { id: req.params.id, patientId: req.user!.id },
  });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  deleteMedicalFile(doc.fileUrl);
  await prisma.patientMedicalDocument.delete({ where: { id: doc.id } });
  res.status(204).send();
};

export const listPatientMedicalDocuments = async (req: AuthRequest, res: Response) => {
  try {
    await assertDoctorPatientRelation(req.user!.id, req.params.patientId);
  } catch (e) {
    return res.status(403).json({ error: (e as Error).message });
  }

  const docs = await prisma.patientMedicalDocument.findMany({
    where: { patientId: req.params.patientId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs.map(toApiDoc));
};
