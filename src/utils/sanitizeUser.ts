import { omitPassword, toApiDoc } from './apiDoc';

export function sanitizeUser(user: { id: string; password?: string; [key: string]: unknown }) {
  return toApiDoc(omitPassword(user));
}
