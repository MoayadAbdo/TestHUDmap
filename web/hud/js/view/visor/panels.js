import { ACCENT, ACCENT_FAINT, ACCENT_SOFT, CAUTION, INK, RED, bar, brackets, hm, plate, say } from './style.js';

const STATUS_COLOR = { ok: INK, warn: CAUTION, danger: RED };
const STATUS_WORD = { ok: 'OK', warn: 'CHECK', danger: 'ALERT' };
// rows whose state is about the ground, not a broken part, say so ("Leg load HIGH", never "Legs ALERT")
const ROW_WORD = { 'Leg load': { warn: 'HIGH', danger: 'TOO HIGH' } };
/** Side panels are about this wide (in u, from the panel's x); the visor keeps its guide out of them. */
export const PANEL_W_U = 27;

function header(ctx, text, x, y, u, align = 'left') {
  say(ctx, text, x, y, 2.1 * u, { weight: 600, align, color: ACCENT });
}

/** Dose: 0.4 µSv, 12 µSv, 1.2 mSv — never stuck at "0" for the first minutes. */
export function doseText(usv) {
  const d = usv ?? 0;
  if (d >= 1000) return `${(d / 1000).toFixed(2)} mSv`;
  return d < 10 ? `${d.toFixed(1)} µSv` : `${Math.round(d)} µSv`;
}

export function drawLocation(ctx, x, y, u, s) {
  header(ctx, 'LOCATION', x, y, u);
  const rows = [
    [`${s.tempC ?? '--'} °C`, `${s.pressurePa ?? '--'} Pa`],
    [s.site, ''],
    [`Mars ${s.marsTime}`, s.daylightMin != null ? `light ${hm(s.daylightMin)}` : `Sol ${s.sol}`],
    [`Earth ${s.earthTime} UTC`, ''],
    [s.dataSol ? `Weather: sol ${s.dataSol}` : '', ''],   // REMS data is from that sol, not today
  ];
  rows.forEach(([a, b], i) => {
    const ry = y + (3.6 + i * 3.3) * u;
    const note = i === 1 || i === 4;
    if (a) say(ctx, a, x, ry, (i === 4 ? 2.1 : 2.6) * u, { color: note ? ACCENT_SOFT : INK });   // values white, notes blue
    if (b) say(ctx, b, x + 17 * u, ry, 2.2 * u, { color: INK });
  });
  brackets(ctx, x - 1.2 * u, y - 2 * u, 27 * u, 20 * u, 1.6 * u);
}

export function drawRadiation(ctx, x, y, u, s) {
  const r = 2.3 * u;
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + r, y, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arc(x + r, y, r * 0.8, a - 0.5, a + 0.5);
    ctx.fill();
  }
  say(ctx, `${s.radUsvH ?? '--'} µSv/h`, x + 2 * r + 1.4 * u, y - 1.3 * u, 2.4 * u, { color: s.radHigh ? RED : INK });
  say(ctx, `Dose ${doseText(s.radDoseUsv)}`, x + 2 * r + 1.4 * u, y + 1.5 * u, 2 * u, { color: ACCENT_SOFT });
}

export function drawBiosigns(ctx, x, y, u, s) {
  header(ctx, 'BIOSIGNS', x, y, u);
  say(ctx, 'simulated', x + 12.5 * u, y, 1.7 * u, { color: ACCENT_SOFT });
  say(ctx, `Breathing  ${s.breathsPerMin}/min`, x, y + 3.4 * u, 2.4 * u);
  say(ctx, `Heart  ${s.heartBpm} bpm`, x, y + 6.6 * u, 2.4 * u);

  const w = 24 * u;
  const baseY = y + 11.5 * u;
  const beatMs = 60000 / Math.max(40, s.heartBpm);
  ctx.strokeStyle = ACCENT;
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 0.8 * u;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const px = x + (i / 120) * w;
    const tMs = s.timeMs - (1 - i / 120) * 2500;
    const p = ((tMs % beatMs) + beatMs) % beatMs / beatMs;
    const spike = p < 0.04 ? -p / 0.04 : p < 0.08 ? -1 + ((p - 0.04) / 0.04) * 1.5 : p < 0.12 ? 0.5 - ((p - 0.08) / 0.04) * 0.5 : 0;
    const py = baseY + spike * 2.6 * u;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  brackets(ctx, x - 1.2 * u, y - 2 * u, 27 * u, 17 * u, 1.6 * u);
}

export function drawComms(ctx, right, y, u, s) {
  const bars = s.link?.bars ?? 0;
  for (let i = 0; i < 4; i++) {
    const bh = (1.2 + i * 0.9) * u;
    ctx.fillStyle = i < bars ? ACCENT : ACCENT_FAINT;
    ctx.fillRect(right - (4 - i) * 1.7 * u, y + 3 * u - bh, 1.2 * u, bh);
  }
  header(ctx, 'COMMS', right - 8 * u, y + 1.8 * u, u, 'right');
  say(ctx, s.link?.label ?? '', right, y + 5.6 * u, 2.2 * u, { align: 'right', color: ACCENT_SOFT });
  say(ctx, `Earth delay ${s.lightMin?.toFixed(1) ?? '--'} min`, right, y + 8.8 * u, 2.3 * u, { align: 'right' });
}

export function drawIntegrity(ctx, right, y, u, s) {
  // a short list, one line per part: name, a status dot and a word (OK / CHECK / ALERT); the suit is simulated
  header(ctx, 'SUIT INTEGRITY', right, y, u, 'right');
  say(ctx, 'simulated', right, y + 2.6 * u, 1.6 * u, { align: 'right', color: ACCENT_SOFT });
  Object.entries(s.integrity ?? {}).forEach(([part, state], i) => {
    const ry = y + (5.8 + i * 2.9) * u;
    const color = STATUS_COLOR[state] ?? INK;
    say(ctx, part, right - 9.5 * u, ry, 2.1 * u, { align: 'right', color: ACCENT_SOFT });
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(right - 8 * u, ry, 0.65 * u, 0, Math.PI * 2);
    ctx.fill();
    say(ctx, ROW_WORD[part]?.[state] ?? STATUS_WORD[state] ?? '--', right, ry, 2.1 * u, { align: 'right', color, weight: 600 });
  });
}


/** Short text for a legend entry: "magenta: polyhydrated sulfates (1.9 µm)" → "polyhydrated sulfates". */
export const legendText = (label) => String(label).split(':').pop().split('(')[0].trim();

/** Which map layer is painted on the ground, with its colour key (right column, under suit integrity). */
export function drawLayer(ctx, right, y, u, layer, { compact = false } = {}) {
  if (!layer) return;
  header(ctx, 'LAYER', right, y, u, 'right');
  say(ctx, layer.name.split(' (')[0], right, y + 3.4 * u, 2.4 * u, { align: 'right' });
  if (!compact) say(ctx, layer.detail ?? `${layer.instrument} · ${layer.resolution_m} m`, right, y + 6.2 * u, 1.9 * u, { align: 'right', color: ACCENT_SOFT });
  const top = compact ? 6.4 : 9;            // full panels: no instrument line, so the key fits inside
  const legend = (layer.legend ?? []).filter((l) => l.color !== '#000000');
  const items = layer.showAll || legend.length <= 3 ? legend : [legend[0], legend[legend.length - 1]];   // long ramps: ends only
  // more than 3 rows: two columns, so the key fits in the panel instead of running off the bottom
  const cols = items.length > 3 ? 2 : 1;
  const rows = Math.ceil(items.length / cols);
  const colW = 15 * u;
  items.forEach((item, i) => {
    const col = Math.floor(i / rows);
    const r = right - (cols - 1 - col) * colW;
    const ry = y + (top + (i % rows) * 2.6) * u;
    ctx.fillStyle = item.color;
    ctx.fillRect(r - 1.6 * u, ry - 0.9 * u, 1.6 * u, 1.6 * u);
    say(ctx, legendText(item.label), r - 2.4 * u, ry, 1.75 * u, { align: 'right', color: ACCENT_SOFT, weight: 500 });
  });
}
