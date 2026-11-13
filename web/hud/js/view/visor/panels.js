import { AMBER, AMBER_FAINT, AMBER_SOFT, RED, bar, brackets, say } from './style.js';

const STATUS_COLOR = { ok: AMBER_SOFT, warn: '#ffd27a', danger: RED };
/** Side panels are about this wide (in u, from the panel's x); the visor keeps its guide out of them. */
export const PANEL_W_U = 27;

function header(ctx, text, x, y, u, align = 'left') {
  say(ctx, text, x, y, 2.3 * u, { weight: 700, align });
}

export function drawLocation(ctx, x, y, u, s) {
  header(ctx, 'LOCATION', x, y, u);
  const rows = [
    [`${s.tempC ?? '--'} °C`, `${s.pressurePa ?? '--'} Pa`],
    [s.site, ''],
    [`Mars ${s.marsTime}`, `Sol ${s.sol}`],
    [`Earth ${s.earthTime}`, 'UTC'],
    [s.dataSol ? `Weather: sol ${s.dataSol}` : '', ''],   // REMS data is from that sol, not today
  ];
  rows.forEach(([a, b], i) => {
    const ry = y + (3.6 + i * 3.3) * u;
    const note = i === 1 || i === 4;
    if (a) say(ctx, a, x, ry, (i === 4 ? 2.1 : 2.6) * u, { color: note ? AMBER_SOFT : AMBER });
    if (b) say(ctx, b, x + 17 * u, ry, 2.2 * u, { color: AMBER_SOFT });
  });
  brackets(ctx, x - 1.2 * u, y - 2 * u, 27 * u, 20 * u, 1.6 * u);
}

export function drawSuit(ctx, x, y, u, s) {
  header(ctx, 'SUIT', x, y, u);
  const minutes = Math.max(0, Math.round(s.o2MinutesLeft ?? 0));
  const o2Color = s.o2Pct < 30 ? RED : AMBER;
  say(ctx, 'Oxygen', x, y + 3.6 * u, 2.5 * u, { color: o2Color });
  say(ctx, `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m left`, x + 24 * u, y + 3.6 * u, 2.3 * u, { align: 'right', color: o2Color });
  bar(ctx, x, y + 5.6 * u, 24 * u, 1.2 * u, s.o2Pct / 100, { color: o2Color });
  say(ctx, 'Power', x, y + 9.6 * u, 2.5 * u);
  say(ctx, `${Math.round(s.powerPct ?? 0)}%`, x + 24 * u, y + 9.6 * u, 2.3 * u, { align: 'right' });
  bar(ctx, x, y + 11.6 * u, 24 * u, 1.2 * u, (s.powerPct ?? 0) / 100);
}

export function drawRadiation(ctx, x, y, u, s) {
  const r = 2.3 * u;
  ctx.strokeStyle = AMBER;
  ctx.fillStyle = AMBER;
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
  say(ctx, `${s.radUsvH ?? '--'} µSv/h`, x + 2 * r + 1.4 * u, y - 1.3 * u, 2.4 * u);
  say(ctx, `Dose ${Math.round(s.radDoseUsv ?? 0)} µSv`, x + 2 * r + 1.4 * u, y + 1.5 * u, 2 * u, { color: AMBER_SOFT });
}

export function drawBiosigns(ctx, x, y, u, s) {
  header(ctx, 'BIOSIGNS', x, y, u);
  say(ctx, 'simulated', x + 12.5 * u, y, 1.7 * u, { color: AMBER_SOFT });
  say(ctx, `Breathing  ${s.breathsPerMin}/min`, x, y + 3.4 * u, 2.4 * u);
  say(ctx, `Heart  ${s.heartBpm} bpm`, x, y + 6.6 * u, 2.4 * u);

  const w = 24 * u;
  const baseY = y + 11.5 * u;
  const beatMs = 60000 / Math.max(40, s.heartBpm);
  ctx.strokeStyle = AMBER;
  ctx.shadowColor = AMBER;
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
    ctx.fillStyle = i < bars ? AMBER : AMBER_FAINT;
    ctx.fillRect(right - (4 - i) * 1.7 * u, y + 3 * u - bh, 1.2 * u, bh);
  }
  header(ctx, 'COMMS', right - 8 * u, y + 1.8 * u, u, 'right');
  say(ctx, s.link?.label ?? '', right, y + 5.6 * u, 2.2 * u, { align: 'right', color: AMBER_SOFT });
  say(ctx, `Earth delay ${s.lightMin?.toFixed(1) ?? '--'} min`, right, y + 8.8 * u, 2.3 * u, { align: 'right' });
}

export function drawIntegrity(ctx, right, y, u, s) {
  header(ctx, 'SUIT INTEGRITY', right, y, u, 'right');
  const fx = right - 20 * u;
  const fy = y + 4 * u;
  ctx.strokeStyle = AMBER_SOFT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(fx, fy + 1.4 * u, 1.4 * u, 0, Math.PI * 2);
  ctx.rect(fx - 2 * u, fy + 3.2 * u, 4 * u, 6 * u);
  ctx.moveTo(fx - 2 * u, fy + 3.6 * u);
  ctx.lineTo(fx - 3.6 * u, fy + 8.6 * u);
  ctx.moveTo(fx + 2 * u, fy + 3.6 * u);
  ctx.lineTo(fx + 3.6 * u, fy + 8.6 * u);
  ctx.moveTo(fx - 1.2 * u, fy + 9.2 * u);
  ctx.lineTo(fx - 1.6 * u, fy + 15 * u);
  ctx.moveTo(fx + 1.2 * u, fy + 9.2 * u);
  ctx.lineTo(fx + 1.6 * u, fy + 15 * u);
  ctx.stroke();
  Object.entries(s.integrity ?? {}).forEach(([part, state], i) => {
    say(ctx, part, right, fy + (1.4 + i * 3) * u, 2.2 * u, { align: 'right', color: STATUS_COLOR[state] ?? AMBER_SOFT });
  });
}


/** Short text for a legend entry: "magenta: polyhydrated sulfates (1.9 µm)" → "polyhydrated sulfates". */
export const legendText = (label) => String(label).split(':').pop().split('(')[0].trim();

/** Which map layer is painted on the ground, with its colour key (right column, under suit integrity). */
export function drawLayer(ctx, right, y, u, layer) {
  if (!layer) return;
  header(ctx, 'LAYER', right, y, u, 'right');
  say(ctx, layer.name.split(' (')[0], right, y + 3.4 * u, 2.4 * u, { align: 'right' });
  say(ctx, `${layer.instrument} · ${layer.resolution_m} m`, right, y + 6.2 * u, 1.9 * u, { align: 'right', color: AMBER_SOFT });
  const legend = (layer.legend ?? []).filter((l) => l.color !== '#000000');
  const items = legend.length > 3 ? [legend[0], legend[legend.length - 1]] : legend;    // long ramps: ends only
  items.forEach((item, i) => {
    const ry = y + (9 + i * 2.8) * u;
    ctx.fillStyle = item.color;
    ctx.fillRect(right - 2 * u, ry - 0.9 * u, 2 * u, 1.8 * u);
    say(ctx, legendText(item.label), right - 2.8 * u, ry, 1.9 * u, { align: 'right', color: AMBER_SOFT, weight: 500 });
  });
}

/** Clean VR view: oxygen time left in one line (red when low). */
export function drawOxygenChip(ctx, x, y, u, s) {
  const minutes = Math.max(0, Math.round(s.o2MinutesLeft ?? 0));
  const color = s.o2Pct < 30 || s.mustReturn ? RED : AMBER;
  say(ctx, `O2 ${Math.round(s.o2Pct)}%  ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`, x, y, 2.3 * u, { color, weight: 700 });
}

/** Clean VR view: link bars and the Earth delay in one line. */
export function drawLinkChip(ctx, right, y, u, s) {
  const bars = s.link?.bars ?? 0;
  for (let i = 0; i < 4; i++) {
    const bh = (0.8 + i * 0.6) * u;
    ctx.fillStyle = i < bars ? AMBER : AMBER_FAINT;
    ctx.fillRect(right - (4 - i) * 1.2 * u, y + 1 * u - bh, 0.8 * u, bh);
  }
  say(ctx, `${s.lightMin?.toFixed(0) ?? '--'} min`, right - 5.6 * u, y, 2.1 * u, { align: 'right', color: AMBER_SOFT });
}
