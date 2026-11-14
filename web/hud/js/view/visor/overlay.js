import { ACCENT, ACCENT_SOFT, CAUTION, FONT, GLASS, INK, NAV, NAV_EDGE, PANEL, RED, brackets, plate, say, wrap } from './style.js';

/** title, what to do, colour. One alert is shown big; the others become small chips under it. */
const ALERTS = {
  RETURN_TO_BASE: (s) => ['RETURN TO BASE', [s.returnReason, s.walkHomeMin ? `walk home ~${s.walkHomeMin} min` : ''].filter(Boolean).join(' · '), RED],
  SOLAR_STORM: () => ['SOLAR STORM', 'Radiation many times normal · head home now', RED],
  O2_LEAK: () => ['O₂ LEAK', 'Head home now · stay calm, breathe slowly', RED],
  LOW_O2: () => ['OXYGEN LOW', 'Head home along the route', RED],
  SLOPE_NO_GO: () => ['NO-GO SLOPE', 'Over 20° (team safety limit) · follow the arrows around it', RED],
  SLOPE_AHEAD: () => ['STEEP GROUND AHEAD', 'Slow down · short steps', CAUTION],
};
const CHIP = { RETURN_TO_BASE: 'RETURN', SOLAR_STORM: 'SOLAR STORM', O2_LEAK: 'O₂ LEAK', LOW_O2: 'O₂ LOW', SLOPE_NO_GO: 'NO-GO SLOPE', SLOPE_AHEAD: 'STEEP' };

/** Draws the alert banner; returns its height in u (0 when calm), so the message can go under it. */
/** '#ffb300' → 'rgba(255, 179, 0, a)' */
function tint(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Outline warning triangle with an "!" (vector, not a text glyph). */
function warnSign(ctx, cx, cy, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.lineJoin = 'miter';
  ctx.shadowColor = color;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 1.15, cy + r * 0.85);
  ctx.lineTo(cx - r * 1.15, cy + r * 0.85);
  ctx.closePath();
  ctx.moveTo(cx, cy - r * 0.35);
  ctx.lineTo(cx, cy + r * 0.3);
  ctx.moveTo(cx, cy + r * 0.5);
  ctx.lineTo(cx, cy + r * 0.62);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** A short column of thin diagonal stripes, like caution tape drawn in lines. */
function hazardTicks(ctx, x, y, h, u, color) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, 0.25 * u);
  ctx.beginPath();
  for (let t = 0; t < h; t += 1.4 * u) { ctx.moveTo(x, y + t + 1.2 * u); ctx.lineTo(x + 2 * u, y + t); }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawAlerts(ctx, cx, y, u, s) {
  const known = s.alerts.filter((a) => ALERTS[a]);
  if (!known.length) return 0;
  const [title, action, color] = ALERTS[known[0]](s);
  const flash = color === RED ? 0.75 + 0.25 * Math.sin(s.timeMs / 160) : 1;
  ctx.font = `600 ${3.4 * u}px ${FONT}`;
  const titleW = ctx.measureText(title).width;
  ctx.font = `500 ${2.2 * u}px ${FONT}`;
  const w = Math.max(titleW + 16 * u, ctx.measureText(action ?? '').width + 10 * u, 44 * u);
  const h = 9.4 * u;
  const x0 = cx - w / 2;
  plate(ctx, x0, y, w, h, { fill: GLASS, radius: 0.4 * u });                  // see-through glass, then a light tint of the alert colour
  plate(ctx, x0, y, w, h, { fill: tint(color, 0.16), radius: 0.4 * u });
  brackets(ctx, x0, y, w, h, 2.4 * u, color, 1.2);
  hazardTicks(ctx, x0 + 1.2 * u, y + 1.4 * u, h - 2.8 * u, u, color);          // thin caution stripes at both ends
  hazardTicks(ctx, x0 + w - 3.2 * u, y + 1.4 * u, h - 2.8 * u, u, color);
  ctx.globalAlpha = flash;
  warnSign(ctx, cx - titleW / 2 - 2.4 * u, y + 3.2 * u, 1.5 * u, color);
  say(ctx, title, cx + 1.2 * u, y + 3.2 * u, 3.4 * u, { align: 'center', color, weight: 600 });
  ctx.globalAlpha = 1;
  if (action) say(ctx, action, cx, y + 7 * u, 2.2 * u, { align: 'center', color: INK, weight: 500 });
  const rest = known.slice(1).filter((a) => !(known[0] === 'RETURN_TO_BASE' && ['SOLAR_STORM', 'O2_LEAK', 'LOW_O2'].includes(a) && s.returnReason));
  if (rest.length) say(ctx, rest.map((a) => CHIP[a]).join('  ·  '), cx, y + h + 1.8 * u, 1.9 * u, { align: 'center', color: ACCENT_SOFT, weight: 600 });
  return h / u + (rest.length ? 3.2 : 0.8);
}

export function drawMessage(ctx, cx, y, u, w, text) {
  if (!text) return;
  ctx.font = `600 ${2.5 * u}px ${FONT}`;
  const lines = wrap(ctx, text, w * 0.42, 2);
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 3 * u;
  plate(ctx, cx - width / 2, y - 1.8 * u, width, lines.length * 3 * u + 0.8 * u, { radius: 0.8 * u });
  const fromGround = text.startsWith('Ground Control:');
  lines.forEach((line, i) => say(ctx, line, cx, y + i * 3 * u, 2.5 * u, { align: 'center', color: fromGround ? NAV : INK }));
}

/** Next stop (or the way home) under the view centre: where to, how far, how long. */
export function drawNextStop(ctx, cx, y, u, s) {
  if (!s.targetName) return;
  const home = s.mustReturn;
  const color = home ? RED : NAV;
  const top = home ? 'RETURN TO' : `NEXT · ${s.stopLabel.toUpperCase()}`;
  const name = s.targetName.toUpperCase();
  // MarStep check for this stop: the margin you'll have when you get there (GO), only just (TIGHT), or not enough (SKIP)
  const check = home ? null : s.marstep?.next;
  const call = !check ? '' : check.call === 'SKIP' ? ' · SKIP, O₂ SHORT' : ` · ×${check.margin >= 10 ? '10+' : check.margin.toFixed(1)} THERE`;
  const dist = `${s.distanceLabel} · ${s.etaMin} MIN${call}`;
  const callColor = !check || check.call === 'GO' ? INK : check.call === 'TIGHT' ? CAUTION : RED;
  ctx.font = `600 ${2.3 * u}px ${FONT}`;
  const distW = ctx.measureText(dist).width;
  ctx.font = `600 ${3.4 * u}px ${FONT}`;
  const w = Math.max(ctx.measureText(name).width, distW, 24 * u) + 6 * u;
  plate(ctx, cx - w / 2, y - 2.2 * u, w, 10.2 * u, { radius: 1 * u, edge: home ? RED : check?.call === 'SKIP' ? RED : NAV_EDGE });
  say(ctx, top, cx, y, 1.9 * u, { align: 'center', color: ACCENT_SOFT, weight: 600 });
  say(ctx, name, cx, y + 3.4 * u, 3.4 * u, { align: 'center', color, weight: 600 });
  say(ctx, dist, cx, y + 6.6 * u, 2.3 * u, { align: 'center', color: callColor, weight: 600 });
}

export function drawVoice(ctx, cx, y, u, w, s) {
  const dot = (x, yy) => { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(x, yy, 0.9 * u, 0, Math.PI * 2); ctx.fill(); };
  if (!s.aiText) {
    if (s.listening) { dot(cx - 5.4 * u, y); say(ctx, 'LISTENING', cx - 3.8 * u, y, 1.9 * u, { color: INK }); }
    return;
  }
  ctx.font = `600 ${2.4 * u}px ${FONT}`;
  const lines = wrap(ctx, s.aiText, w * 0.44, 2);
  const boxW = w * 0.5;
  const boxH = lines.length * 3 * u + 2 * u;
  plate(ctx, cx - boxW / 2, y - boxH / 2, boxW, boxH, { fill: PANEL, radius: 0.8 * u });
  brackets(ctx, cx - boxW / 2, y - boxH / 2, boxW, boxH, 1.4 * u);
  if (s.listening) dot(cx - boxW / 2 + 1.8 * u, y);                 // inside the box: listening now
  lines.forEach((line, i) => say(ctx, line, cx, y - boxH / 2 + 2.5 * u + i * 3 * u, 2.4 * u, { align: 'center' }));
}

export function drawWaiting(ctx, cx, cy, u, text) {
  ctx.font = `600 ${3 * u}px ${FONT}`;
  const w = ctx.measureText(text).width + 6 * u;
  plate(ctx, cx - w / 2, cy - 3 * u, w, 6 * u, { radius: 1 * u });
  say(ctx, text, cx, cy, 3 * u, { align: 'center', weight: 600 });
}

/** Always-on arrow under the view centre: the way to go along the path (0 = straight ahead, + = right). */
export function drawDirectionArrow(ctx, cx, cy, u, deg, color = NAV, { label = true } = {}) {
  if (deg == null) return;
  const r = 3.4 * u;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';                 // a thin HUD chevron: outline + light fill, not a sticker
  ctx.shadowBlur = 0.8 * u;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, r * 0.7);
  ctx.lineTo(0, r * 0.3);
  ctx.lineTo(-r * 0.7, r * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.28;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 0.45 * u);
  ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 0;
  const turn = label ? turnWord(deg) : '';
  if (turn) say(ctx, turn, cx, cy + r + 2.2 * u, 2.4 * u, { align: 'center', color, weight: 600 });
}

/** One word for the way to go: '' when roughly ahead. */
export function turnWord(deg) {
  if (Math.abs(deg) > 150) return 'TURN AROUND';
  if (deg < -35) return 'TURN LEFT';
  if (deg > 35) return 'TURN RIGHT';
  return '';
}

/** Small key hint at the bottom (hand-held only: a VR box has no keyboard). */
export function drawFooter(ctx, x, y, u, s) {
  const text = s.detail === 'full' ? 'I · FOCUS VIEW' : 'I · ALL PANELS';
  say(ctx, text, x, y, 1.7 * u, { color: ACCENT_SOFT, weight: 600 });
}

export { ACCENT };
