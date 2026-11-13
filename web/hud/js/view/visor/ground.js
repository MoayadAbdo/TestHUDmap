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
  if (Math.abs(relDeg) > coneDeg) return turn;
  const at = projectGround(target, { centerY: 0, ...view });
  return at && at.x >= clear.minX && at.x <= clear.maxX ? 'guide' : turn;
}

const STEEP = '#ff7a4d';

/** Path point d metres ahead (scene.path has a point every 0.5 m). */
const along = (path, d) => path[Math.min(path.length - 1, Math.max(0, Math.round(d / 0.5)))];

/**
 * Pokémon GO style guidance in the camera view: chevrons on the ground along the walking path
 * (Curiosity's route, not the straight line), red where it is steep, and a glowing pin over the stop.
 * Chevrons show wherever they land between the side panels; a turn hint when the way to go is off to the side.
 * clear = { minX, maxX } for chevrons, pinClear for the pin and its label.
 */
export function drawGroundGuide(ctx, w, h, u, s, clear = { minX: 0, maxX: w }, pinClear = clear) {
  const scene = s.scene;
  if (!scene) return;
  const target = scene.stops.find((p) => p.isTarget) ?? (scene.base.isTarget ? scene.base : null);
  if (!target) return;
  const color = s.mustReturn ? RED : AMBER;
  const view = { centerX: w / 2, centerY: h / 2, focalPx: focalForFov(w, FOV_DEG), pitchDeg: s.pitch ?? 0 };
  const inside = (c, zone) => c && c.x >= zone.minX && c.x <= zone.maxX;
  const path = scene.path ?? [];
  const lengthM = path.length ? path[path.length - 1].d : 0;

  const flow = ((s.timeMs / 1000) * 1.2) % SPACING_M;
  ctx.shadowColor = color;
  for (let d = 2.5 + flow; d < Math.min(lengthM - 1, FARTHEST_M); d += SPACING_M) {   // from 2.5 m: not under your feet
    const here = along(path, d);
    const next = along(path, d + 0.5);
    const len = Math.hypot(next.forward - here.forward, next.right - here.right) || 1;
    const dir = { forward: (next.forward - here.forward) / len, right: (next.right - here.right) / len };
    const left = { forward: dir.right, right: -dir.forward };
    const onGround = { ...view, eyeHeightM: here.eye ?? 1.6 };      // real 3D ground height when the sim gives it
    const at = (ahead, across) => projectGround({
      forward: here.forward + dir.forward * ahead + left.forward * across,
      right: here.right + dir.right * ahead + left.right * across,
    }, onGround);
    const corners = [at(0.7, 0), at(-0.45, 0.55), at(-0.1, 0), at(-0.45, -0.55)];
    if (corners.some((c) => !inside(c, clear))) continue;   // never over the side panels
    ctx.fillStyle = here.steep ? STEEP : color;
    ctx.globalAlpha = Math.max(0.12, 0.9 - d / FARTHEST_M);
    ctx.shadowBlur = 1.2 * u;
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  const ground = projectGround(target, { ...view, eyeHeightM: target.eye ?? 1.6 });   // null when behind you or under your feet
  if (ground && inside(ground, pinClear) && guideSide(target, view, pinClear) === 'guide') drawPin(ctx, ground, u, view, target.forward, color, s);
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
