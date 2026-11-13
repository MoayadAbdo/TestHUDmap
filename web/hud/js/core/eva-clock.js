import { formatHours } from './mars-time.js';

/**
 * The sim's own Mars clock: every practice walk starts at 09:00 local Mars time,
 * so it is always daylight (the real clock at Gale is night half the time).
 * Sunset at Gale (4.6° S) is close to 18:00 local mean solar time all year.
 */
export const EVA_START_H = 9;
export const SUNSET_H = 18;

/** elapsedMs: time since the walk started (Earth ms; a sol is 2.7% longer, close enough for the visor). */
export function evaClock(elapsedMs, { startH = EVA_START_H, sunsetH = SUNSET_H } = {}) {
  const hours = startH + elapsedMs / 3600000;
  const daylightMin = Math.max(0, Math.round((sunsetH - hours) * 60));
  return { marsTime: formatHours(hours), daylightMin, elapsedMin: Math.floor(elapsedMs / 60000) };
}

/** "8h 05m" */
export function hoursMinutes(min) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
