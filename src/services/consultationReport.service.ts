import { Appointment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { saveBase64MedicalFile } from './medicalDocumentStorage.service';
import { toApiDoc } from '../utils/apiDoc';
import { sendConsultationSummaryToChat } from './consultationReportChat.service';

export type ConsultationReportInput = {
  findings: string;
  diagnosis: string;
  medications?: string;
  instructions: string;
  noMedication?: boolean;
  templateId?: string;
  followUpDate?: string | null;
  followUpNote?: string | null;
  attachments?: Array<{
    dataBase64: string;
    mimeType: string;
    fileName?: string;
  }>;
};

export function mapConsultationReport(
  report: {
    id: string;
    appointmentId: string;
    findings: string;
    diagnosis: string;
    medications: string;
    instructions: string;
    noMedication: boolean;
    attachmentUrls: string[];
    templateId: string | null;
    followUpDate: Date | null;
    followUpNote: string | null;
    patientAcknowledgedAt: Date | null;
    createdAt: Date;
  },
) {
  return toApiDoc({
    ...report,
    patientAcknowledged: report.patientAcknowledgedAt != null,
  });
}

function parseFollowUpDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Fecha de seguimiento no válida');
  }
  return d;
}

export function validateReportInput(input: ConsultationReportInput): void {
  const findings = input.findings?.trim();
  const diagnosis = input.diagnosis?.trim();
  const instructions = input.instructions?.trim();
  if (!findings) throw new Error('Describe qué presenta el paciente');
  if (!diagnosis) throw new Error('El diagnóstico o impresión clínica es obligatorio');
  if (!instructions) throw new Error('Las instrucciones para el paciente son obligatorias');
  const noMed = input.noMedication === true;
  const meds = input.medications?.trim() ?? '';
  if (!noMed && !meds) {
    throw new Error('Indica los medicamentos o marca "Sin medicación"');
  }
}

function storeAttachments(
  attachments: ConsultationReportInput['attachments'],
): string[] {
  if (!attachments?.length) return [];
  const urls: string[] = [];
  for (const file of attachments) {
    if (!file.dataBase64?.trim() || !file.mimeType?.trim()) continue;
    const stored = saveBase64MedicalFile(
      file.dataBase64.trim(),
      file.mimeType.trim(),
      file.fileName?.trim() || 'receta',
    );
    urls.push(stored.fileUrl);
  }
  return urls;
}

export async function saveConsultationReport(
  appointmentId: string,
  input: ConsultationReportInput,
) {
  validateReportInput(input);
  const attachmentUrls = storeAttachments(input.attachments);

  const data = {
    findings: input.findings.trim(),
    diagnosis: input.diagnosis.trim(),
    medications: input.noMedication ? '' : (input.medications?.trim() ?? ''),
    instructions: input.instructions.trim(),
    noMedication: input.noMedication === true,
    attachmentUrls,
    templateId: input.templateId?.trim() || null,
    followUpDate: parseFollowUpDate(input.followUpDate),
    followUpNote: input.followUpNote?.trim() || null,
  };

  return prisma.appointmentConsultationReport.upsert({
    where: { appointmentId },
    create: { appointmentId, ...data },
    update: data,
  });
}

export async function recordCompletedVisitFromReport(
  appointment: Appointment,
  doctorId: string,
  report: ConsultationReportInput,
  attachmentUrls: string[] = [],
): Promise<void> {
  const title =
    appointment.reason?.trim() ||
    `Consulta ${appointment.type === 'ONLINE' ? 'telemedicina' : 'presencial'}`;

  let history = await prisma.medicalHistory.findUnique({
    where: { patientId: appointment.patientId },
  });
  if (!history) {
    history = await prisma.medicalHistory.create({
      data: { patientId: appointment.patientId },
    });
  }

  const medsBlock = report.noMedication
    ? 'Sin medicación indicada.'
    : (report.medications?.trim() || '—');

  await prisma.medicalHistoryEntry.create({
    data: {
      medicalHistoryId: history.id,
      date: appointment.dateTime,
      doctorId,
      title,
      description: report.findings.trim(),
      diagnosis: report.diagnosis.trim(),
      treatment: `Medicamentos:\n${medsBlock}\n\nInstrucciones:\n${report.instructions.trim()}`,
      attachments: attachmentUrls,
    },
  });
}

export async function completeAppointmentWithReport(
  appointment: Appointment,
  doctorId: string,
  input: ConsultationReportInput,
) {
  const saved = await saveConsultationReport(appointment.id, input);
  await recordCompletedVisitFromReport(
    appointment,
    doctorId,
    input,
    saved.attachmentUrls,
  );
  try {
    await sendConsultationSummaryToChat(appointment, doctorId, {
      findings: saved.findings,
      diagnosis: saved.diagnosis,
      medications: saved.medications,
      instructions: saved.instructions,
      noMedication: saved.noMedication,
      followUpDate: saved.followUpDate,
      followUpNote: saved.followUpNote,
    });
  } catch (e) {
    console.error('No se pudo enviar resumen al chat:', e);
  }
  return saved;
}

export function appointmentNeedsClosure(
  appointment: {
    status: string;
    dateTime: Date;
    endTime: Date | null;
    durationMinutes: number;
    consultationReport: { id: string } | null;
  },
  now = new Date(),
): boolean {
  if (appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED') {
    return false;
  }
  if (appointment.consultationReport) return false;
  const end =
    appointment.endTime ??
    new Date(appointment.dateTime.getTime() + appointment.durationMinutes * 60_000);
  return now >= end;
}
