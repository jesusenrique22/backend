/* eslint-disable @typescript-eslint/no-require-imports */
const defaults = require('../../../config/secrets.defaults.cjs') as {
  DEV_JWT_SECRET: string;
  DEV_INTERNAL_REALTIME_SECRET: string;
};

/** Solo desarrollo; en producción exige variables de entorno. */
export function jwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || defaults.DEV_JWT_SECRET;
}

export function internalRealtimeSecret(): string {
  return (
    process.env.INTERNAL_REALTIME_SECRET?.trim() ||
    defaults.DEV_INTERNAL_REALTIME_SECRET
  );
}
