import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../types/enums';
import { isSuperAdminRole } from '../utils/roleHelpers';

import { jwtSecret } from '../config/secrets';

const JWT_SECRET = jwtSecret();

export interface AuthPayload {
  id: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const role = req.user.role;
    const allowed = roles.some((r) => {
      if (r === UserRole.SUPER_ADMIN && isSuperAdminRole(role)) return true;
      if (r === UserRole.ADMIN && isSuperAdminRole(role)) return true;
      return r === role;
    });
    if (!allowed) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
}

export function authorizeSuperAdmin() {
  return authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN);
}
