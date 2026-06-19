import {
  assertEmergencyParticipant,
  createEmergencyChatMessage,
  resolveEmergencyCallPeer,
} from './emergency.service';
import type { RealtimeBroadcast, RealtimeHandlerResult } from './realtimeOrchestration.service';

export async function validateEmergencyJoin(
  userId: string,
  emergencyRequestId: string,
): Promise<{ ok: boolean; peerId?: string }> {
  return assertEmergencyParticipant(emergencyRequestId, userId);
}

export async function handleEmergencyMessageSend(
  userId: string,
  payload: { emergencyRequestId: string; text: string },
): Promise<RealtimeHandlerResult> {
  const message = await createEmergencyChatMessage({
    emergencyRequestId: payload.emergencyRequestId,
    senderId: userId,
    text: payload.text,
  });

  return {
    broadcasts: [],
    ack: {
      ok: true,
      message: {
        id: message.id,
        text: message.text,
        senderId: message.senderId,
        createdAt: message.createdAt,
      },
    },
  };
}

export async function handleEmergencyCallInvite(
  userId: string,
  payload: {
    emergencyRequestId: string;
    callType: 'video' | 'audio';
    callerName?: string;
  },
): Promise<RealtimeHandlerResult> {
  const check = await assertEmergencyParticipant(payload.emergencyRequestId, userId);
  if (!check.ok || !check.peerId) return { broadcasts: [] };

  return {
    broadcasts: [
      {
        room: `user:${check.peerId}`,
        event: 'call:incoming',
        payload: {
          conversationId: payload.emergencyRequestId,
          emergencyRequestId: payload.emergencyRequestId,
          callType: payload.callType,
          callerId: userId,
          callerName: payload.callerName ?? 'Usuario',
          isEmergency: true,
        },
      },
    ],
  };
}

export async function handleEmergencyCallAccept(
  userId: string,
  emergencyRequestId: string,
): Promise<RealtimeHandlerResult & { peerId?: string }> {
  const peerId = await resolveEmergencyCallPeer(userId, emergencyRequestId);
  if (!peerId) return { broadcasts: [] };

  return {
    peerId,
    broadcasts: [
      {
        room: `user:${peerId}`,
        event: 'call:accepted',
        payload: { conversationId: emergencyRequestId, userId },
      },
    ],
  };
}

export async function handleEmergencyCallReject(
  userId: string,
  emergencyRequestId: string,
): Promise<RealtimeHandlerResult> {
  const peerId = await resolveEmergencyCallPeer(userId, emergencyRequestId);
  if (!peerId) return { broadcasts: [] };

  const rejectedPayload = { conversationId: emergencyRequestId, userId };
  return {
    broadcasts: [
      { room: `user:${peerId}`, event: 'call:rejected', payload: rejectedPayload },
      {
        room: `call:${emergencyRequestId}`,
        event: 'call:rejected',
        payload: rejectedPayload,
      },
    ],
  };
}

export async function handleEmergencyCallEnd(
  userId: string,
  emergencyRequestId: string,
): Promise<RealtimeHandlerResult> {
  const peerId = await resolveEmergencyCallPeer(userId, emergencyRequestId);
  const endedPayload = { conversationId: emergencyRequestId, userId };
  const broadcasts: RealtimeBroadcast[] = [
    {
      room: `call:${emergencyRequestId}`,
      event: 'call:ended',
      payload: endedPayload,
    },
  ];
  if (peerId) {
    broadcasts.unshift({
      room: `user:${peerId}`,
      event: 'call:ended',
      payload: endedPayload,
    });
  }
  return { broadcasts };
}
