// Mantener alineado con realtime-gateway/src/config/cors.ts (ver docs/COMMUNICATION.md).
import cors, { CorsOptions } from 'cors';

/** Cursor / VS Code Dev Tunnels, GitHub Codespaces, localhost. */
const DEV_TUNNEL_ORIGIN =
  /^https:\/\/([a-z0-9-]+\.)*(devtunnels\.ms|github\.dev|githubpreview\.dev)(:\d+)?$/i;

function parseExtraOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (DEV_TUNNEL_ORIGIN.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
    return true;
  }
  const extras = parseExtraOrigins();
  return extras.some((e) => origin === e || origin.startsWith(e));
}

export function createCorsMiddleware() {
  const options: CorsOptions = {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Forwarded-For',
      'X-Forwarded-Host',
      'X-Forwarded-Proto',
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  };

  return cors(options);
}

export function socketIoCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (!origin || process.env.NODE_ENV !== 'production' || isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS socket bloqueado: ${origin}`));
}
