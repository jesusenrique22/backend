import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/enums';
import {
  assertConversationParticipant,
  createChatMessage,
  ChatMessageKind,
} from '../services/chatMessage.service';
import {
  assertDoctorPatientCanCommunicate,
  getEligiblePeerIds,
  isEligiblePair,
  userIdFromRef,
} from '../services/chatEligibility.service';
import { mapChatConversation, mapChatMessage } from '../utils/prismaMappers';
import { omitPassword, toApiDoc } from '../utils/apiDoc';
import { buildMessageBroadcasts } from '../services/realtimeOrchestration.service';
import { pushRealtimeBroadcasts } from '../socket/realtimeGatewayClient';
import { saveBase64ChatImage } from '../services/chatImageStorage.service';

function parseKind(value: unknown): ChatMessageKind | undefined {
  if (value === 'clinical' || value === 'chat') return value;
  return undefined;
}

function mapChatError(res: Response, e: unknown) {
  const msg = (e as Error).message;
  if (msg === 'Conversación no encontrada') {
    return res.status(404).json({ error: msg });
  }
  if (msg === 'Acceso denegado') {
    return res.status(403).json({ error: msg });
  }
  if (msg.includes('consulta') || msg.includes('comunicarte')) {
    return res.status(403).json({ error: msg });
  }
  return res.status(400).json({ error: msg });
}

export const listConversations = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const isDoctor = req.user!.role === UserRole.DOCTOR;
  const eligiblePeerIds = await getEligiblePeerIds(userId, isDoctor);

  const conversations = await prisma.chatConversation.findMany({
    where: isDoctor ? { doctorId: userId } : { patientId: userId },
    include: { doctor: true, patient: true },
    orderBy: [
      { lastChatMessageAt: 'desc' },
      { lastMessageAt: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  const filtered = conversations
    .map(mapChatConversation)
    .filter((c) => {
      const docId = userIdFromRef(c.doctorId);
      const patId = userIdFromRef(c.patientId);
      if (!docId || !patId) return false;
      return isEligiblePair(docId, patId, eligiblePeerIds, isDoctor);
    });

  res.json(filtered);
};

export const listContacts = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const isDoctor = req.user!.role === UserRole.DOCTOR;
  const forNew = req.query.forNew !== 'false';

  let peerIds = await getEligiblePeerIds(userId, isDoctor);

  if (forNew && peerIds.length > 0) {
    const existing = await prisma.chatConversation.findMany({
      where: isDoctor ? { doctorId: userId } : { patientId: userId },
      select: { doctorId: true, patientId: true },
    });
    const existingPeerIds = new Set(
      existing.map((c) => (isDoctor ? c.patientId : c.doctorId)),
    );
    peerIds = peerIds.filter((id) => !existingPeerIds.has(id));
  }

  if (peerIds.length === 0) {
    return res.json([]);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: peerIds } },
    select: { id: true, name: true, email: true, profilePic: true, role: true },
    orderBy: { name: 'asc' },
  });

  return res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      profilePic: u.profilePic,
      role: isDoctor ? 'patient' : 'doctor',
    })),
  );
};

export const getClinicalFeed = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const isDoctor = req.user!.role === UserRole.DOCTOR;
  const eligiblePeerIds = await getEligiblePeerIds(userId, isDoctor);

  const conversations = await prisma.chatConversation.findMany({
    where: isDoctor ? { doctorId: userId } : { patientId: userId },
    select: { id: true, doctorId: true, patientId: true },
  });

  const convIds = conversations
    .filter((c) =>
      isEligiblePair(c.doctorId, c.patientId, eligiblePeerIds, isDoctor),
    )
    .map((c) => c.id);

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: { in: convIds }, kind: 'clinical' },
    include: {
      sender: true,
      conversation: { include: { doctor: true, patient: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json(
    messages.map((m) =>
      toApiDoc({
        ...m,
        senderId: m.sender ? toApiDoc(m.sender) : m.senderId,
        conversationId: m.conversation
          ? {
              ...toApiDoc(m.conversation),
              doctorId: m.conversation.doctor
                ? toApiDoc(m.conversation.doctor)
                : m.conversation.doctorId,
              patientId: m.conversation.patient
                ? toApiDoc(m.conversation.patient)
                : m.conversation.patientId,
            }
          : m.conversationId,
      }),
    ),
  );
};

export const getOrCreateConversation = async (req: AuthRequest, res: Response) => {
  const { doctorId, patientId } = req.body;

  let docId = doctorId;
  let patId = patientId;

  if (req.user!.role === UserRole.DOCTOR) {
    docId = req.user!.id;
    if (!patId) return res.status(400).json({ error: 'patientId requerido' });
  } else {
    patId = req.user!.id;
    if (!docId) return res.status(400).json({ error: 'doctorId requerido' });
  }

  try {
    await assertDoctorPatientCanCommunicate(docId, patId);
  } catch (e) {
    return mapChatError(res, e);
  }

  let conversation = await prisma.chatConversation.findUnique({
    where: { doctorId_patientId: { doctorId: docId, patientId: patId } },
    include: { doctor: true, patient: true },
  });

  if (!conversation) {
    conversation = await prisma.chatConversation.create({
      data: { doctorId: docId, patientId: patId },
      include: { doctor: true, patient: true },
    });
  }

  res.json(mapChatConversation(conversation));
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  let conversation;
  try {
    conversation = await assertConversationParticipant(
      req.params.conversationId,
      req.user!.id,
    );
    await assertDoctorPatientCanCommunicate(
      conversation.doctorId,
      conversation.patientId,
    );
  } catch (e) {
    return mapChatError(res, e);
  }

  const kind = parseKind(req.query.kind) ?? 'chat';
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id, kind },
    include: { sender: true },
    orderBy: { createdAt: 'asc' },
  });

  res.json(messages.map(mapChatMessage));
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { conversationId, text, kind, imageBase64, mimeType } = req.body as {
    conversationId?: string;
    text?: string;
    kind?: string;
    imageBase64?: string;
    mimeType?: string;
  };
  try {
    let imageUrl: string | undefined;
    if (imageBase64?.trim()) {
      if (!mimeType?.trim()) {
        return res.status(400).json({ error: 'mimeType requerido con la imagen' });
      }
      const stored = saveBase64ChatImage(imageBase64.trim(), mimeType.trim());
      imageUrl = stored.fileUrl;
    }

    const parsedKind = parseKind(kind);
    const { message, conversation, kind: messageKind, preview } = await createChatMessage({
      conversationId: conversationId!,
      senderId: req.user!.id,
      text: text ?? '',
      imageUrl,
      kind: parsedKind,
    });
    const broadcasts = buildMessageBroadcasts(
      req.user!.id,
      conversationId!,
      message,
      messageKind,
      conversation,
      preview,
    );
    await pushRealtimeBroadcasts(broadcasts);
    res.status(201).json(message);
  } catch (e) {
    return mapChatError(res, e);
  }
};
