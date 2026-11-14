import { marstepState } from '../../core/marstep.js';
import { ACCENT, ACCENT_SOFT, CAUTION, FONT, INK, RED, bar, hm, say } from './style.js';

/**
 * MarStep on the visor: one bar where the oxygen used to be. It replaces the oxygen time, %, tank bar and power bar.
 * Drawn in the visor's own style (style.js): thin vector slashes, no filled backgrounds, cyan labels, white values,
 * amber = be careful, red = act now.
 *
 *   MARSTEP              TURN BACK IN          label · what the value on the right means
 *   97 /100                    6h 30m         the score (0–100) · the action, as a time
 *   ||||||||||||||||||||||                    the bar fills with the score
 *   you can go +8.7 km                        a hint (wide views only)
 *
 * Why (AR / HUD practice):
 *   - one number, 0–100, read in a glance: "how much of my oxygen is still mine to spend"; 0 = turn back now
 *   - a bar that empties like a fuel gauge reads in peripheral vision, without reading the digits
 *   - colour never carries the meaning alone: every state also has words (TURN BACK IN · HOME SOON · HEAD HOME)
 *   - top-left corner, away from the centre of the view, where the ground and the path are
 *   - the value on the right is an action as a time, not a measurement
 * Everything else the suit knows shows only when it needs a decision (exceptionChips below).
 */
export const BAR_W_U = 25;
export const COMPACT_W_U = 24;              // narrow views (each eye of the VR box): the centre stays clear
export const barWidthU = (compact) => (compact ? COMPACT_W_U : BAR_W_U);
const STATE_COLOR = { go: ACCENT, soon: CAUTION, home: RED };

const minText = (m) => (m < 60 ? `${Math.max(1, Math.round(m))} min` : hm(m));
const distText = (m) => (!Number.isFinite(m) ? '--' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** What the bar says: the state, its colour, the label + value on the right, and the hint under it. */
export function gaugeText(s) {
  const ms = s.marstep;
  const state = marstepState({ margin: s.energy?.margin, mustReturn: s.mustReturn, o2Pct: s.o2Pct });
  const score = ms?.score ?? null;
  let word;
  let value;
  let hint = '';
  if (state === 'home') {
    word = 'HEAD HOME';
    value = s.walkHomeMin ? `~${s.walkHomeMin} min` : 'NOW';
    hint = 'follow the arrows home';
  } else if (state === 'soon') {
    word = 'HOME SOON';
    value = ms?.turnBackMin > 0 ? minText(ms.turnBackMin) : 'NOW';
    hint = 'finish this stop, then go';
  } else {
    word = 'TURN BACK IN';
    value = ms?.turnBackMin > 0 ? minText(ms.turnBackMin) : '--';
    hint = ms?.reachM > 0 ? `you can go +${distText(ms.reachM)}` : '';
  }
  return { state, score, color: STATE_COLOR[state], word, value, hint };
}

/** Draws the MarStep bar; returns its height in u. */
export function drawMarStepBar(ctx, x, y, u, s, { compact = false } = {}) {
  const g = gaugeText(s);
  const w = barWidthU(compact) * u;
  const pulse = g.state === 'home' ? 0.6 + 0.4 * Math.abs(Math.sin((s.timeMs ?? 0) / 300)) : 1;
  // sent home for another reason (storm, leak, recall) while the oxygen is fine: the number and bar dim,
  // so the eye goes to HEAD HOME and the screen never argues with itself
  const otherReason = g.state === 'home' && g.score > 0;
  const alpha = ctx.globalAlpha;

  say(ctx, 'MARSTEP', x, y, (compact ? 1.9 : 2.1) * u, { color: ACCENT, weight: 600 });
  ctx.globalAlpha = alpha * pulse;
  const word = compact ? g.word.replace('TURN BACK IN', 'TURN BACK') : g.word;
  say(ctx, word, x + w, y, (compact ? 1.7 : 1.9) * u, { align: 'right', color: g.state === 'go' ? ACCENT_SOFT : g.color, weight: 600 });
  say(ctx, g.value, x + w, y + 3.9 * u, 3.3 * u, { align: 'right', color: g.state === 'go' ? INK : g.color, weight: 600 });
  ctx.globalAlpha = alpha;

  const num = g.score == null ? '--' : String(g.score);
  say(ctx, num, x, y + 3.9 * u, 3.3 * u, { color: otherReason ? ACCENT_SOFT : g.state === 'go' ? INK : g.color, weight: 600 });
  ctx.font = `600 ${3.3 * u}px ${FONT}`;
  say(ctx, '/100', x + ctx.measureText(num).width + 0.6 * u, y + 4.5 * u, 1.7 * u, { color: ACCENT_SOFT, weight: 600 });

  ctx.globalAlpha = alpha * (otherReason ? 1 : pulse);
  bar(ctx, x, y + 6.6 * u, w, 1 * u, (g.score ?? 0) / 100, { color: otherReason ? ACCENT_SOFT : g.color });
  ctx.globalAlpha = alpha;

  if (!compact && g.hint) {
    say(ctx, g.hint, x, y + 9.6 * u, 1.9 * u, { color: ACCENT_SOFT, weight: 600 });
    return 9.6;
  }
  return 7.6;
}

/**
 * Exceptions: things the astronaut only needs when they call for a decision. Each comes with what it means.
 * The most urgent first, at most 3, so the corner never fills up.
 */
export function exceptionChips(s) {
  const chips = [];
  const ms = s.marstep;
  if (s.radHigh || s.radUsvH > 100) chips.push({ text: `RADIATION ${Math.round(s.radUsvH)} µSv/h`, color: RED, rank: 0 });
  // 'Leg load' is effort on steep ground, not a broken part: the slope alerts already cover it
  const bad = Object.entries(s.integrity ?? {}).filter(([k, v]) => k !== 'Leg load' && (v === 'danger' || v === 'warn'));
  if (bad.length) chips.push({ text: `SUIT CHECK · ${bad.map(([k]) => k).join(', ')}`, color: bad.some(([, v]) => v === 'danger') ? RED : CAUTION, rank: 1 });
  if (ms?.zone?.id === 'peak') chips.push({ text: 'PEAK EFFORT · slow down', color: CAUTION, rank: 2 });
  if (Number.isFinite(s.powerPct) && s.powerPct < 20) chips.push({ text: `SUIT POWER ${Math.round(s.powerPct)}%`, color: CAUTION, rank: 3 });
  if (s.link && (s.link.bars ?? 0) === 0) chips.push({ text: 'NO LINK TO BASE', color: CAUTION, rank: 4 });
  if (Number.isFinite(s.daylightMin) && s.daylightMin < 60) chips.push({ text: `DAYLIGHT ${Math.round(s.daylightMin)} min`, color: CAUTION, rank: 5 });
  if (s.heartBpm > 150) chips.push({ text: `HEART ${s.heartBpm} bpm`, color: CAUTION, rank: 6 });
  return chips.sort((a, b) => a.rank - b.rank).slice(0, 3);
}

/** One line per exception: a short colour tick + words (never colour alone), no backing. Returns the height used (u). */
export function drawExceptionChips(ctx, x, y, u, s, { compact = false } = {}) {
  const chips = exceptionChips(s);
  chips.forEach((c, i) => {
    const cy = y + i * 3.2 * u;
    ctx.fillStyle = c.color;
    ctx.fillRect(x, cy - 1 * u, 0.45 * u, 2 * u);
    say(ctx, compact ? c.text.split(' · ')[0] : c.text, x + 1.4 * u, cy, (compact ? 1.8 : 2) * u, { color: c.color, weight: 600 });
  });
  return chips.length * 3.2;
}
