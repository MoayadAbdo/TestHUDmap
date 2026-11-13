import { focalForFov, projectGround } from '../../core/ar.js';
import { AMBER, RED, say } from './style.js';

const FOV_DEG = 62;
const SPACING_M = 2.5;
const FARTHEST_M = 30;
const GUIDE_CONE_DEG = 24;

/**
 * 'guide' when the pin lands in the clear middle of the visor (between the side panels), else the way to turn.
 * clear = { minX, maxX } in pixels.
 */
export function guideSide(target, view, clear, coneDeg = GUIDE_CONE_DEG) {
  const relDeg = (Math.atan2(target.right, target.forward) * 180) / Math.PI;
  const turn = relDeg < 0 ? 'left' : 'right';
  if (target.forward <= 1 || Math.abs(relDeg) > coneDeg) return turn;
  const x = view.centerX + (view.focalPx * target.right) / target.forward;
  return x >= clear.minX && x <= clear.maxX ? 'guide' : turn;
}

/**
 * Pokémon GO style guidance in the camera view: chevrons painted on the ground towards the next stop,
 * and a glowing pin standing over the stop itself. If the stop is out of the clear middle, a turn hint.
 */
export function drawGroundGuide(ctx, w, h, u, s, clear = { minX: 0, maxX: w }) {
  const scene = s.scene;
  if (!scene) return;
  const target = scene.stops.find((p) => p.isTarget) ?? (scene.base.isTarget ? scene.base : null);
  if (!target) return;
  const color = s.mustReturn ? RED : AMBER;
  const view = { centerX: w / 2, horizonY: h * 0.5, focalPx: focalForFov(w, FOV_DEG) };
  const dist = Math.hypot(target.forward, target.right) || 1;
  const dir = { forward: target.forward / dist, right: target.right / dist };
  const left = { forward: dir.right, right: -dir.forward };

  const side = guideSide(target, view, clear);
  if (side !== 'guide') {
    drawTurnHint(ctx, w, h, u, side === 'left' ? -1 : 1, color);
    return;
  }

  const flow = ((s.timeMs / 1000) * 1.2) % SPACING_M;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  for (let d = 1.5 + flow; d < Math.min(dist - 1, FARTHEST_M); d += SPACING_M) {
    const at = (along, across) => projectGround({
      forward: dir.forward * (d + along) + left.forward * across,
      right: dir.right * (d + along) + left.right * across,
    }, view);
    const corners = [at(0.8, 0), at(-0.5, 0.75), at(-0.1, 0), at(-0.5, -0.75)];
    if (corners.some((c) => !c || c.x < clear.minX || c.x > clear.maxX)) continue;   // never over the side panels
    ctx.globalAlpha = Math.max(0.12, 0.9 - d / FARTHEST_M);
    ctx.shadowBlur = 1.2 * u;
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const ground = projectGround(target, view);   // null when the stop is under your feet
  if (ground) drawPin(ctx, ground, u, view, target.forward, color, s);
}

function drawTurnHint(ctx, w, h, u, side, color) {
  const x = w / 2 + side * Math.min(w * 0.18, 26 * u);
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 220);
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = pulse * (1 - i * 0.25);
    say(ctx, side < 0 ? '‹' : '›', x + side * i * 3 * u, h * 0.47, 10 * u, { align: 'center', color, weight: 500 });
  }
  ctx.globalAlpha = 1;
  say(ctx, side < 0 ? 'TURN LEFT' : 'TURN RIGHT', x + side * 3 * u, h * 0.47 + 7.5 * u, 2.8 * u, { align: 'center', color, weight: 700 });
}

function drawPin(ctx, ground, u, view, forward, color, s) {
  const height = Math.max(9 * u, Math.min(30 * u, (view.focalPx * 3) / forward));
  const topY = ground.y - height;
  const beam = ctx.createLinearGradient(0, topY, 0, ground.y);
  beam.addColorStop(0, color);
  beam.addColorStop(1, 'rgba(255, 181, 71, 0)');
  ctx.strokeStyle = beam;
  ctx.lineWidth = Math.max(2, 0.5 * u);
  ctx.beginPath();
  ctx.moveTo(ground.x, ground.y);
  ctx.lineTo(ground.x, topY);
  ctx.stroke();

  ctx.save();
  ctx.translate(ground.x, ground.y);
  ctx.scale(1, 0.32);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const pulse = 1 + 0.25 * Math.sin(s.timeMs / 300);
  ctx.beginPath();
  ctx.arc(0, 0, 3 * u * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const r = 2.4 * u;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 2.5 * u;
  ctx.beginPath();
  ctx.moveTo(ground.x, topY - r);
  ctx.lineTo(ground.x + r, topY);
  ctx.lineTo(ground.x, topY + r);
  ctx.lineTo(ground.x - r, topY);
  ctx.fill();
  ctx.shadowBlur = 0;
  say(ctx, (s.targetName ?? '').toUpperCase(), ground.x, topY - 5 * u, 2.8 * u, { align: 'center', color, weight: 700 });
  say(ctx, `${s.distanceLabel}   ${s.etaMin} MIN`, ground.x, topY - 2.2 * u - 0.6 * u, 2.2 * u, { align: 'center', color });
}
