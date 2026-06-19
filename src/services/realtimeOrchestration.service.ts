import { prisma } from '../lib/prisma';
import { assertDoctorPatientCanCommunicate } from './chatEligibility.service';
import { createChatMessage } from './chatMessage.service';

export type RealtimeBroadcast = {
  room: string;
  event: string;
  payload: Record<string, unknown>;
};

export type RealtimeHandlerResult = {
  broadcasts: RealtimeBroadcast[];
  ack?: Record<string, unknown>;
};

function peerUserId(
  conversation: { doctorId: string; patientId: string },
  userId: string,
): string {
  return conversation.doctorId === userId ? conversation.patientId : conversation.doctorId;
}

export async function validateConversationJoin(
  userId: string,
  conversationId: string,
): Promise<{ ok: boolean; peerId?: string }> {
  try {
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { ok: false };
    const isParticipant =
      conversation.doctorId === userId || conversation.patientId === userId;
    if (!isParticipant) return { ok: false };
    await assertDoctorPatientCanCommunicate(
      conversation.doctorId,
      conversation.patientId,
    );
    return { ok: true, peerId: peerUserId(conversation, userId) };
  } catch {
    return { ok: false };
  }
}

export function buildMessageBroadcasts(
  senderId: string,
  conversationId: string,
  message: unknown,
  kind: 'chat' | 'clinical',
  conversation: {
    doctorId: string;
    patientId: string;
    lastChatMessage: string | null;
    lastClinicalMessage: string | null;
  },
  preview: string,
): RealtimeBroadcast[] {
  const peerId = peerUserId(conversation, senderId);
  const messagePayload = {
    conversationId,
    kind,
    message,
  };
  return [
    {
      room: `conversation:${conversationId}`,
      event: 'message:new',
      payload: messagePayload,
    },
    // Copia al usuario: no depende de conversation:join (p. ej. iOS tras reconectar).
    {
      room: `user:${peerId}`,
      event: 'message:new',
      payload: messagePayload,
    },
    {
      room: `user:${peerId}`,
      event: 'conversation:updated',
      payload: {
        conversationId,
        kind,
        lastMessage: preview,
        lastChatMessage: conversation.lastChatMessage,
        lastClinicalMessage: conversation.lastClinicalMessage,
      },
    },
  ];
}

export async function handleSocketMessageSend(
  userId: string,
  payload: {
    conversationId: string;
    text: string;
    kind?: 'chat' | 'clinical';
    imageUrl?: string;
  },
): Promise<RealtimeHandlerResult> {
  const { message, conversation, kind, preview } = await createChatMessage({
    conversationId: payload.conversationId,
    senderId: userId,
    text: payload.text,
    imageUrl: payload.imageUrl,
    kind: payload.kind,
  });

  const broadcasts = buildMessageBroadcasts(
    userId,
    payload.conversationId,
    message,
    kind,
    conversation,
    preview,
  );

  return {
    broadcasts,
    ack: { ok: true, message },
  };
}

export async function handleCallInvite(
  userId: string,
  payload: {
    conversationId: string;
    callType: 'video' | 'audio';
    callerName?: string;
  },
): Promise<RealtimeHandlerResult> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: payload.conversationId },
  });
  if (!conversation) return { broadcasts: [] };

  const isParticipant =
    conversation.doctorId === userId || conversation.patientId === userId;
  if (!isParticipant) return { broadcasts: [] };

  try {
    await assertDoctorPatientCanCommunicate(
      conversation.doctorId,
      conversation.patientId,
    );
  } catch {
    return { broadcasts: [] };
  }

  const calleeId = peerUserId(conversation, userId);
  return {
    broadcasts: [
      {
        room: `user:${calleeId}`,
        event: 'call:incoming',
        payload: {
          conversationId: payload.conversationId,
          callType: payload.callType,
          callerId: userId,
          callerName: payload.callerName ?? 'Usuario',
        },
      },
    ],
  };
}

export async function handleCallAccept(
  userId: string,
  payload: { conversationId: string },
): Promise<RealtimeHandlerResult & { peerId?: string }> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: payload.conversationId },
  });
  if (!conversation) return { broadcasts: [] };

  const peerId = peerUserId(conversation, userId);
  const acceptedPayload = {
    conversationId: payload.conversationId,
    userId,
  };

  // Solo al par (user:peerId): evita duplicar call:accepted en la sala call:
  // cuando el llamante ya está en call:… y recibiría el evento dos veces.
  return {
    peerId,
    broadcasts: [
      { room: `user:${peerId}`, event: 'call:accepted', payload: acceptedPayload },
    ],
  };
}

export async function handleCallReject(
  userId: string,
  payload: { conversationId: string },
): Promise<RealtimeHandlerResult> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: payload.conversationId },
  });
  if (!conversation) return { broadcasts: [] };

  const peerId = peerUserId(conversation, userId);
  const rejectedPayload = {
    conversationId: payload.conversationId,
    userId,
  };

  return {
    broadcasts: [
      { room: `user:${peerId}`, event: 'call:rejected', payload: rejectedPayload },
      {
        room: `call:${payload.conversationId}`,
        event: 'call:rejected',
        payload: rejectedPayload,
      },
    ],
  };
}

export async function handleCallEnd(
  userId: string,
  payload: { conversationId: string },
): Promise<RealtimeHandlerResult> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: payload.conversationId },
  });
  const endedPayload = {
    conversationId: payload.conversationId,
    userId,
  };

  const broadcasts: RealtimeBroadcast[] = [
    {
      room: `call:${payload.conversationId}`,
      event: 'call:ended',
      payload: endedPayload,
    },
  ];

  if (conversation) {
    const peerId = peerUserId(conversation, userId);
    broadcasts.unshift({
      room: `user:${peerId}`,
      event: 'call:ended',
      payload: endedPayload,
    });
  }

  return { broadcasts };
}

export async function resolveCallPeer(
  userId: string,
  conversationId: string,
): Promise<string | null> {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) return null;
  const isParticipant =
    conversation.doctorId === userId || conversation.patientId === userId;
  if (!isParticipant) return null;
  return peerUserId(conversation, userId);
}

export async function getClinicAdminFacilityRoom(
  userId: string,
): Promise<string | null> {
  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { managedFacilityId: true },
  });
  return admin?.managedFacilityId ?? null;
}
