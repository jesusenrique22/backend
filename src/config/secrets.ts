let defaults = {
  DEV_JWT_SECRET: 'smart-medic-dev-secret',
  DEV_INTERNAL_REALTIME_SECRET: 'smart-medic-internal-dev',
};
try {
  defaults = require('../../../config/secrets.defaults.cjs');
} catch (e) {
  // Ignored in production where env variables are provided
}


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
