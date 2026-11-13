import { focalForFov, projectGround } from '../../core/ar.js';
import { INK, NAV, say } from './style.js';

const FOV_DEG = 62;

/** A ring over the nearest unscanned science rock: "SAMPLE · LOOK HERE 2 s". */
export function drawScanTarget(ctx, w, h, u, s, clear) {
  const t = s.scan?.target;
  if (!t || s.card) return;
  // the 3D sim says exactly where the rock is on screen; the ground maths is only a fallback
  let p = null;
  let size = 0;
  if (t.screen) { p = { x: t.screen.x * w, y: t.screen.y * h }; size = t.screen.size * h; }
  else {
    const view = { centerX: w / 2, centerY: h / 2, focalPx: focalForFov(w, FOV_DEG), pitchDeg: s.pitch ?? 0, eyeHeightM: (t.eye ?? 1.6) - 0.4 };
    p = projectGround(t, view);
    size = p ? p.scale * 0.9 : 0;
  }
  if (!p || p.x < clear.minX || p.x > clear.maxX || p.y < h * 0.15 || p.y > h * 0.9) return;
  const pulse = 1 + 0.12 * Math.sin((s.timeMs ?? 0) / 220);
  const r = Math.max(2.5 * u, Math.min(12 * u, size * 1.3)) * pulse;
  ctx.strokeStyle = NAV;
  ctx.lineWidth = Math.max(2, 0.45 * u);
  ctx.setLineDash([1.4 * u, 0.9 * u]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const labelY = Math.min(p.y - r - 2.2 * u, h * 0.64);          // stays above the next-stop box
  say(ctx, '◎ SAMPLE · LOOK HERE 2 s', p.x, labelY, 2.1 * u, { align: 'center', color: NAV, weight: 600 });
  say(ctx, `${Math.round(t.distM)} m`, p.x, p.y + r + 2 * u, 1.8 * u, { align: 'center', color: INK, weight: 600 });
}

/** While you look at the rock: a ring filling around the centre of the view. */
export function drawScanProgress(ctx, cx, cy, u, s) {
  const p = s.scan?.progress ?? 0;
  if (p <= 0) return;
  const r = 3.4 * u;
  ctx.strokeStyle = 'rgba(95, 224, 143, 0.25)';
  ctx.lineWidth = 0.7 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = NAV;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
  ctx.stroke();
  say(ctx, `SCANNING ${Math.round(p * 100)}%`, cx, cy + r + 2.4 * u, 2 * u, { align: 'center', color: NAV, weight: 600 });
}
