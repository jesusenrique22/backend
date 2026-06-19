import { Request, Response, NextFunction } from 'express';

import { internalRealtimeSecret } from '../config/secrets';

const INTERNAL_SECRET = internalRealtimeSecret();

export function requireInternalRealtimeAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.header('X-Internal-Key');
  if (!key || key !== INTERNAL_SECRET) {
    res.status(401).json({ error: 'No autorizado (internal)' });
    return;
  }
  next();
}
