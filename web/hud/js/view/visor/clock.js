import { ACCENT, INK, PANEL, hm, plate, say } from './style.js';

/** Mars time and the daylight left, on their own small plate under the vitals (walking view). */
export function drawClock(ctx, x, y, u, s) {
  const w = 25 * u;
  plate(ctx, x - 1.6 * u, y - 2.6 * u, w + 3.2 * u, 8.6 * u, { fill: PANEL, radius: 1 * u });
  say(ctx, 'MARS TIME', x, y, 2.1 * u, { color: ACCENT, weight: 600 });
  say(ctx, s.marsTime ?? '--:--', x, y + 3.6 * u, 3.3 * u, { color: INK, weight: 600 });
  if (s.daylightMin == null) return;
  say(ctx, 'DAYLIGHT', x + w, y, 2.1 * u, { align: 'right', color: ACCENT, weight: 600 });
  say(ctx, hm(s.daylightMin), x + w, y + 3.6 * u, 3.3 * u, { align: 'right', color: INK, weight: 600 });
}
