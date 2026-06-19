import type { RealtimeBroadcast } from '../services/realtimeOrchestration.service';

import { internalRealtimeSecret } from '../config/secrets';

const GATEWAY_URL = process.env.REALTIME_GATEWAY_URL || 'http://localhost:3001';
const INTERNAL_SECRET = internalRealtimeSecret();

async function emitToRoom(
  room: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(`${GATEWAY_URL}/internal/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_SECRET,
      },
      body: JSON.stringify({ room, event, payload }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[realtime-gateway] emit failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.warn('[realtime-gateway] emit error:', (err as Error).message);
  }
}

export function emitToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  void emitToRoom(`user:${userId}`, event, payload);
}

export function emitToFacility(
  facilityId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  void emitToRoom(`facility:${facilityId}`, event, payload);
}

/** Propaga eventos al gateway (mensajes REST, invitaciones, etc.). */
export async function pushRealtimeBroadcasts(
  broadcasts: RealtimeBroadcast[],
): Promise<void> {
  await Promise.all(
    broadcasts.map((b) => emitToRoom(b.room, b.event, b.payload)),
  );
}
