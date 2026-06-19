import { prisma } from '../lib/prisma';
import { toApiDoc } from '../utils/apiDoc';

export type ConsultationTemplateInput = {
  label: string;
  description?: string;
  findingsHint?: string;
  diagnosisHint?: string;
  medicationsHint?: string;
  instructionsHint?: string;
  defaultNoMedication?: boolean;
};

function mapTemplate(template: {
  id: string;
  doctorId: string;
  label: string;
  description: string;
  findingsHint: string | null;
  diagnosisHint: string | null;
  medicationsHint: string | null;
  instructionsHint: string | null;
  defaultNoMedication: boolean;
  sortOrder: number;
  createdAt: Date;
}) {
  return toApiDoc({
    ...template,
    isCustom: true,
  });
}

export async function listDoctorConsultationTemplates(doctorId: string) {
  const rows = await prisma.doctorConsultationTemplate.findMany({
    where: { doctorId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(mapTemplate);
}

export async function createDoctorConsultationTemplate(
  doctorId: string,
  input: ConsultationTemplateInput,
) {
  const label = input.label?.trim();
  if (!label) throw new Error('El nombre de la plantilla es obligatorio');

  const count = await prisma.doctorConsultationTemplate.count({ where: { doctorId } });
  if (count >= 20) {
    throw new Error('Máximo 20 plantillas personalizadas por médico');
  }

  const row = await prisma.doctorConsultationTemplate.create({
    data: {
      doctorId,
      label,
      description: input.description?.trim() || '',
      findingsHint: input.findingsHint?.trim() || null,
      diagnosisHint: input.diagnosisHint?.trim() || null,
      medicationsHint: input.medicationsHint?.trim() || null,
      instructionsHint: input.instructionsHint?.trim() || null,
      defaultNoMedication: input.defaultNoMedication === true,
      sortOrder: count,
    },
  });
  return mapTemplate(row);
}

export async function deleteDoctorConsultationTemplate(
  doctorId: string,
  templateId: string,
) {
  const row = await prisma.doctorConsultationTemplate.findFirst({
    where: { id: templateId, doctorId },
  });
  if (!row) throw new Error('Plantilla no encontrada');
  await prisma.doctorConsultationTemplate.delete({ where: { id: templateId } });
}
