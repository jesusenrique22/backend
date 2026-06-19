import { prisma } from '../lib/prisma';
import { assertDoctorPatientCanCommunicate } from './chatEligibility.service';
import { createChatNotification, getSenderName } from './notification.service';
import { mapChatMessage } from '../utils/prismaMappers';

export type ChatMessageKind = 'chat' | 'clinical';

export async function assertConversationParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    throw new Error('Conversación no encontrada');
  }

  const isParticipant =
    conversation.doctorId === userId || conversation.patientId === userId;

  if (!isParticipant) {
    throw new Error('Acceso denegado');
  }

  return conversation;
}

export async function createChatMessage(params: {
  conversationId: string;
  senderId: string;
  text?: string;
  imageUrl?: string | null;
  kind?: ChatMessageKind;
}) {
  const { conversationId, senderId } = params;
  const kind: ChatMessageKind = params.kind === 'clinical' ? 'clinical' : 'chat';
  const trimmed = String(params.text ?? '').trim();
  const imageUrl = params.imageUrl?.trim() || null;

  if (!trimmed && !imageUrl) {
    throw new Error('El mensaje no puede estar vacío');
  }
  if (imageUrl && kind === 'clinical') {
    throw new Error('Las imágenes solo se envían en el chat, no en indicaciones clínicas');
  }

  const conversation = await assertConversationParticipant(conversationId, senderId);
  await assertDoctorPatientCanCommunicate(conversation.doctorId, conversation.patientId);

  const preview = imageUrl ? (trimmed || '📷 Foto') : trimmed;

  const message = await prisma.chatMessage.create({
    data: {
      conversationId,
      senderId,
      text: trimmed,
      imageUrl,
      kind,
    },
    include: { sender: true },
  });

  const now = new Date();
  if (kind === 'clinical') {
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastClinicalMessage: preview, lastClinicalMessageAt: now },
    });
  } else {
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        lastChatMessage: preview,
        lastChatMessageAt: now,
        lastMessage: preview,
        lastMessageAt: now,
      },
    });
  }

  const recipientId =
    conversation.doctorId === senderId ? conversation.patientId : conversation.doctorId;

  const senderName = await getSenderName(senderId);
  await createChatNotification({
    recipientId,
    senderId,
    senderName,
    text: preview,
    conversationId: conversation.id,
  });

  const updatedConversation = await prisma.chatConversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  return {
    message: mapChatMessage(message),
    conversation: updatedConversation,
    kind,
    preview,
  };
}
