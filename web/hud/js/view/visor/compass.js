import { wrap180 } from '../../core/geo.js';
import { ACCENT, ACCENT_SOFT, INK, say } from './style.js';

const SPAN_DEG = 90;
const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/** Heading strip across the top, with a diamond for the next stop (or an edge arrow if it is out of view). */
export function drawCompass(ctx, cx, y, width, u, heading, targetBearing, color = ACCENT) {
  const pxPerDeg = width / SPAN_DEG;
  const fade = (x) => Math.max(0, 1 - ((x - cx) / (width / 2)) ** 2);

  ctx.lineWidth = 1.5;
  for (let d = Math.floor((heading - SPAN_DEG / 2) / 5) * 5; d <= heading + SPAN_DEG / 2; d += 5) {
    const deg = ((d % 360) + 360) % 360;
    const x = cx + wrap180(d - heading) * pxPerDeg;
    ctx.globalAlpha = fade(x);
    const tall = deg % 45 === 0 ? 2.4 * u : deg % 15 === 0 ? 1.5 * u : 0.8 * u;
    ctx.strokeStyle = ACCENT_SOFT;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - tall);
    ctx.stroke();
    if (NAMES[deg]) say(ctx, NAMES[deg], x, y - 4.2 * u, 2.6 * u, { align: 'center', weight: 600, color: INK });
    else if (deg % 30 === 0) say(ctx, String(deg), x, y - 3.6 * u, 1.9 * u, { align: 'center', color: ACCENT_SOFT });
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.moveTo(cx, y + 0.6 * u);
  ctx.lineTo(cx - 1.1 * u, y + 2.2 * u);
  ctx.lineTo(cx + 1.1 * u, y + 2.2 * u);
  ctx.fill();
  say(ctx, `${Math.round(((heading % 360) + 360) % 360)}°`, cx, y + 4 * u, 2.4 * u, { align: 'center', weight: 600 });

  if (targetBearing == null) return;
  const rel = wrap180(targetBearing - heading);
  if (Math.abs(rel) <= SPAN_DEG / 2) {
    const x = cx + rel * pxPerDeg;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(x, y - 6.8 * u);
    ctx.lineTo(x + 1.2 * u, y - 5.6 * u);
    ctx.lineTo(x, y - 4.4 * u);
    ctx.lineTo(x - 1.2 * u, y - 5.6 * u);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    const side = rel < 0 ? -1 : 1;
    const x = cx + side * (width / 2 + 2 * u);
    say(ctx, side < 0 ? '◀' : '▶', x, y - 2 * u, 3 * u, { align: 'center', color });
  }
}
