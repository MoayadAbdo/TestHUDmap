import { focalForFov, placeOnView } from '../../core/ar.js';
import { CAREFUL_DEG, NO_GO_DEG } from '../../core/hazards.js';
import { CAUTION, INK, PANEL, RED, plate, say } from './style.js';

const FOV_DEG = 62;
const SIGN_HEIGHT_M = 2.2;
const OK = '#4ade80';

/** Warning signs standing over the nearest dangers: "⚠ 22° SLOPE · 15 m" / "ROUGH GROUND · 12 m". */
export function drawDangerSigns(ctx, w, h, u, s, clear) {
  const signs = s.dangers?.signs ?? [];
  const view = { w, h, project: s.project, centerX: w / 2, centerY: h / 2, focalPx: focalForFov(w, FOV_DEG), pitchDeg: s.pitch ?? 0 };
  for (const sign of signs) {
    const ground = placeOnView(sign, view);
    const top = placeOnView(sign, view, SIGN_HEIGHT_M);
    if (!ground || !top || ground.x < clear.minX || ground.x > clear.maxX) continue;
    const color = sign.kind === 'slope' ? RED : CAUTION;
    const near = Math.max(0.8, Math.min(1.25, 25 / sign.distM));       // closer signs are bigger, far ones stay readable
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = Math.max(1.5, 0.35 * u);
    ctx.setLineDash([0.8 * u, 0.6 * u]);
    ctx.beginPath();
    ctx.moveTo(ground.x, ground.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const r = 2.2 * u * near;                                          // the warning triangle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y - r);
    ctx.lineTo(top.x + r * 1.1, top.y + r * 0.8);
    ctx.lineTo(top.x - r * 1.1, top.y + r * 0.8);
    ctx.closePath();
    ctx.fill();
    say(ctx, '!', top.x, top.y + 0.1 * r, 1.6 * r, { align: 'center', color: '#1a0808', weight: 800 });
    const label = sign.kind === 'slope' ? `${Math.round(sign.deg)}° SLOPE` : 'ROUGH GROUND';
    say(ctx, label, top.x, top.y - r - 1.6 * u * near, 2.2 * u * near, { align: 'center', color, weight: 800 });
    say(ctx, `${Math.round(sign.distM)} m`, top.x, top.y - r - 3.8 * u * near, 1.9 * u * near, { align: 'center', color: INK, weight: 700 });
  }
}

/** The next 60 m of the path as a strip coloured by slope, with the first steep stretch named. */
export function drawPathProfile(ctx, cx, y, u, s) {
  const profile = s.dangers?.profile ?? [];
  if (profile.length < 2) return;
  const w = 34 * u;
  const h = 1.5 * u;
  const x0 = cx - w / 2;
  plate(ctx, x0 - 1.2 * u, y - 1.6 * u, w + 2.4 * u, 6.6 * u, { fill: PANEL, radius: 0.8 * u });
  const step = w / (profile.length - 1);
  profile.forEach((p, i) => {
    if (i === profile.length - 1) return;
    ctx.fillStyle = p.deg > NO_GO_DEG ? RED : p.deg > CAREFUL_DEG ? CAUTION : OK;
    ctx.fillRect(x0 + i * step, y, step + 0.5, h);
  });
  ctx.fillStyle = INK;                                                 // you are here
  ctx.beginPath();
  ctx.moveTo(x0, y - 0.6 * u);
  ctx.lineTo(x0 + 1.2 * u, y + h / 2);
  ctx.lineTo(x0, y + h + 0.6 * u);
  ctx.fill();
  const steep = s.dangers.steep;
  const what = steep && steep.maxDeg > NO_GO_DEG ? 'No-go slope' : 'Careful';
  const text = !steep ? 'Clear ahead: no slope over 12° in 60 m'
    : steep.startM < 2 ? `${what} now: ${Math.round(steep.maxDeg)}° for ${Math.round(steep.lengthM)} m, short steps`
      : `${what} in ${Math.round(steep.startM)} m: ${Math.round(steep.maxDeg)}° for ${Math.round(steep.lengthM)} m`;
  say(ctx, text, cx, y + h + 2.4 * u, 1.9 * u, { align: 'center', color: steep ? (steep.maxDeg > NO_GO_DEG ? RED : CAUTION) : INK, weight: 700 });
  say(ctx, `${profile[profile.length - 1].d} m`, x0 + w, y - 1 * u, 1.5 * u, { align: 'right', color: INK });
}

/** Red glow on the side of the view where no-go ground is close (stronger when closer). */
export function drawEdgeGlow(ctx, w, h, u, s) {
  const near = s.dangers?.near;
  if (!near) return;
  const strength = Math.max(0, Math.min(1, 1 - near.distM / 15));
  if (strength <= 0) return;
  const pulse = 0.75 + 0.25 * Math.sin((s.timeMs ?? 0) / 160);
  const alpha = 0.55 * strength * pulse;
  const band = w * 0.16;
  const sides = Math.abs(near.relDeg) < 25 ? ['bottom'] : Math.abs(near.relDeg) > 155 ? ['left', 'right'] : [near.relDeg < 0 ? 'left' : 'right'];
  for (const side of sides) {
    const g = side === 'left' ? ctx.createLinearGradient(0, 0, band, 0)
      : side === 'right' ? ctx.createLinearGradient(w, 0, w - band, 0)
        : ctx.createLinearGradient(0, h, 0, h - band);
    g.addColorStop(0, `rgba(255, 50, 50, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 50, 50, 0)');
    ctx.fillStyle = g;
    if (side === 'left') ctx.fillRect(0, 0, band, h);
    else if (side === 'right') ctx.fillRect(w - band, 0, band, h);
    else ctx.fillRect(0, h - band, w, band);
  }
  const where = sides[0] === 'bottom' ? 'AHEAD' : sides.length > 1 ? 'BEHIND' : sides[0] === 'left' ? 'LEFT' : 'RIGHT';
  say(ctx, `NO-GO SLOPE ${where} · ${Math.round(near.distM)} m`, w / 2, h * 0.58, 2 * u, { align: 'center', color: RED, weight: 800 });
}
