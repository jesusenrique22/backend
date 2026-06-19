import { Appointment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createChatMessage } from './chatMessage.service';
import { buildMessageBroadcasts } from './realtimeOrchestration.service';
import { pushRealtimeBroadcasts } from '../socket/realtimeGatewayClient';

function formatDateEs(date: Date): string {
  return date.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildSummaryMessage(params: {
  findings: string;
  diagnosis: string;
  medications: string;
  instructions: string;
  noMedication: boolean;
  followUpDate: Date | null;
  followUpNote: string | null;
}): string {
  const meds = params.noMedication
    ? 'Sin medicación indicada en esta consulta.'
    : params.medications.trim() || '—';

  const lines = [
    '📋 Resumen de tu consulta',
    '',
    `Diagnóstico: ${params.diagnosis.trim()}`,
    '',
    'Medicamentos:',
    meds,
    '',
    'Instrucciones:',
    params.instructions.trim(),
  ];

  if (params.followUpDate) {
    lines.push('');
    lines.push(`Próximo control sugerido: ${formatDateEs(params.followUpDate)}`);
    if (params.followUpNote?.trim()) {
      lines.push(params.followUpNote.trim());
    }
  }

  lines.push('');
  lines.push(
    'Revisa el detalle completo y descarga tu PDF en Mis citas → Historial.',
  );

  return lines.join('\n');
}

export async function sendConsultationSummaryToChat(
  appointment: Appointment,
  doctorId: string,
  report: {
    findings: string;
    diagnosis: string;
    medications: string;
    instructions: string;
    noMedication: boolean;
    followUpDate: Date | null;
    followUpNote: string | null;
  },
): Promise<void> {
  let conversation = await prisma.chatConversation.findUnique({
    where: {
      doctorId_patientId: {
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.chatConversation.create({
      data: {
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
      },
    });
  }

  const text = buildSummaryMessage(report);

  const { message, conversation: updated, kind, preview } = await createChatMessage({
    conversationId: conversation.id,
    senderId: doctorId,
    text,
    kind: 'clinical',
  });

  const broadcasts = buildMessageBroadcasts(
    doctorId,
    conversation.id,
    message,
    kind,
    updated,
    preview,
  );
  await pushRealtimeBroadcasts(broadcasts);
}
