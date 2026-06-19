import { Request, Response } from 'express';
import {
  handleEmergencyCallAccept,
  handleEmergencyCallEnd,
  handleEmergencyCallInvite,
  handleEmergencyCallReject,
  handleEmergencyMessageSend,
  validateEmergencyJoin,
} from '../services/emergencyRealtime.service';
import { getDriverFacilityRoom } from '../services/emergency.service';
import {
  getClinicAdminFacilityRoom,
  handleCallAccept,
  handleCallEnd,
  handleCallInvite,
  handleCallReject,
  handleSocketMessageSend,
  resolveCallPeer,
  validateConversationJoin,
} from '../services/realtimeOrchestration.service';

export const postConversationJoin = async (req: Request, res: Response) => {
  const { userId, conversationId } = req.body as {
    userId?: string;
    conversationId?: string;
  };
  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'userId y conversationId son obligatorios' });
  }
  const result = await validateConversationJoin(userId, conversationId);
  res.json(result);
};

export const postMessageSend = async (req: Request, res: Response) => {
  const { userId, conversationId, text, kind } = req.body as {
    userId?: string;
    conversationId?: string;
    text?: string;
    kind?: 'chat' | 'clinical';
  };
  if (!userId || !conversationId || text == null) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  try {
    const result = await handleSocketMessageSend(userId, {
      conversationId,
      text: String(text),
      kind,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
};

export const postCallInvite = async (req: Request, res: Response) => {
  const { userId, conversationId, callType, callerName } = req.body;
  if (!userId || !conversationId || !callType) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleCallInvite(userId, {
    conversationId,
    callType,
    callerName,
  });
  res.json(result);
};

export const postCallAccept = async (req: Request, res: Response) => {
  const { userId, conversationId } = req.body;
  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleCallAccept(userId, { conversationId });
  res.json(result);
};

export const postCallReject = async (req: Request, res: Response) => {
  const { userId, conversationId } = req.body;
  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleCallReject(userId, { conversationId });
  res.json(result);
};

export const postCallEnd = async (req: Request, res: Response) => {
  const { userId, conversationId } = req.body;
  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleCallEnd(userId, { conversationId });
  res.json(result);
};

export const postCallPeer = async (req: Request, res: Response) => {
  const { userId, conversationId } = req.body;
  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const peerId = await resolveCallPeer(userId, conversationId);
  res.json({ peerId });
};

export const postClinicAdminRooms = async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(400).json({ error: 'userId es obligatorio' });
  }
  const facilityId = await getClinicAdminFacilityRoom(userId);
  res.json({
    rooms: facilityId ? [`facility:${facilityId}`] : [],
  });
};

export const postEmergencyJoin = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId } = req.body as {
    userId?: string;
    emergencyRequestId?: string;
  };
  if (!userId || !emergencyRequestId) {
    return res.status(400).json({ error: 'userId y emergencyRequestId son obligatorios' });
  }
  const result = await validateEmergencyJoin(userId, emergencyRequestId);
  res.json(result);
};

export const postEmergencyMessageSend = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId, text } = req.body as {
    userId?: string;
    emergencyRequestId?: string;
    text?: string;
  };
  if (!userId || !emergencyRequestId || text == null) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  try {
    const result = await handleEmergencyMessageSend(userId, {
      emergencyRequestId,
      text: String(text),
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
};

export const postEmergencyCallInvite = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId, callType, callerName } = req.body;
  if (!userId || !emergencyRequestId || !callType) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleEmergencyCallInvite(userId, {
    emergencyRequestId,
    callType,
    callerName,
  });
  res.json(result);
};

export const postEmergencyCallAccept = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId } = req.body;
  if (!userId || !emergencyRequestId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleEmergencyCallAccept(userId, emergencyRequestId);
  res.json(result);
};

export const postEmergencyCallReject = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId } = req.body;
  if (!userId || !emergencyRequestId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleEmergencyCallReject(userId, emergencyRequestId);
  res.json(result);
};

export const postEmergencyCallEnd = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId } = req.body;
  if (!userId || !emergencyRequestId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const result = await handleEmergencyCallEnd(userId, emergencyRequestId);
  res.json(result);
};

export const postEmergencyCallPeer = async (req: Request, res: Response) => {
  const { userId, emergencyRequestId } = req.body;
  if (!userId || !emergencyRequestId) {
    return res.status(400).json({ error: 'Parámetros incompletos' });
  }
  const { resolveEmergencyCallPeer } = await import('../services/emergency.service');
  const peerId = await resolveEmergencyCallPeer(userId, emergencyRequestId);
  res.json({ peerId });
};

export const postDriverRooms = async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(400).json({ error: 'userId es obligatorio' });
  }
  const facilityId = await getDriverFacilityRoom(userId);
  res.json({
    rooms: facilityId ? [`facility:${facilityId}`] : [],
  });
};
