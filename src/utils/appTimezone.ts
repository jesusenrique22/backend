/**
 * Zona horaria de la app (por defecto Venezuela / America/Caracas, UTC-4).
 * Los horarios de agenda son "hora de pared" en esta zona y se persisten en UTC.
 */
export const APP_TIMEZONE =
  process.env.APP_TIMEZONE?.trim() || 'America/Caracas';

/** Minutos respecto a UTC (Caracas = -240). */
export const APP_TZ_OFFSET_MINUTES = Number(
  process.env.APP_TZ_OFFSET_MINUTES ?? '-240',
);

/** Instante UTC a partir de fecha civil + minutos desde medianoche en zona de la app. */
export function wallClockToDate(
  year: number,
  month: number,
  day: number,
  minutesFromMidnight: number,
): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const utcMs =
    Date.UTC(year, month - 1, day, h, m, 0, 0) -
    APP_TZ_OFFSET_MINUTES * 60_000;
  return new Date(utcMs);
}

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** Hora 12 h con AM/PM en zona de la app. */
export function formatTime12h(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '12';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const period = (parts.find((p) => p.type === 'dayPeriod')?.value ?? 'AM').toUpperCase();
  return `${hour}:${minute} ${period}`;
}

/** Texto legible de cita en zona de la app (notificaciones, etc.). */
export function formatApptWhen(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(date);

  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const monthNum = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
  const monthLabel = MONTHS_ES[Math.max(0, monthNum - 1)] ?? '???';
  return `${day} ${monthLabel} · ${formatTime12h(date)}`;
}
