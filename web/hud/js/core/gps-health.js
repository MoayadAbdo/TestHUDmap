/** Why the metres may not change: weak, approximate or stuck GPS. Returns a short visor message or ''. */
export function gpsWarning(position, nowMs) {
  if (!position?.fixAt) return '';
  const age = (nowMs - position.fixAt) / 1000;
  const m = Math.round(position.accuracy);
  if (position.accuracy > 200) return `GPS only approximate (±${m} m): turn on "Use precise location" for Chrome`;
  if (age > 10) return `GPS not updating (${Math.round(age)} s): go outside, away from buildings`;
  if (position.accuracy > 25) return `GPS weak (±${m} m): metres may jump`;
  return '';
}
