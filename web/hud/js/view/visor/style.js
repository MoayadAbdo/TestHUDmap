/*
 * Visor colours have one meaning each, so the astronaut reads the colour before the words:
 *   INK      numbers and names to read (warm white: readable on bright sky and dark ground)
 *   AMBER    labels and frames (the suit's own look)
 *   NAV      where to go: arrow, path, pin, next stop (cyan: never used for data)
 *   CAUTION  be careful (steep ground)
 *   RED      act now (return to base, oxygen, radiation)
 * Every text gets a dark outline and a dark shadow (not a coloured glow, which blurs it),
 * and every group sits on a dark plate, so it stays readable over the bright Mars sky.
 */
export const INK = '#fff4e2';
export const AMBER = '#ffb547';
export const AMBER_SOFT = 'rgba(255, 196, 120, 0.9)';
export const AMBER_FAINT = 'rgba(255, 181, 71, 0.28)';
export const NAV = '#4fe3ea';
export const CAUTION = '#ffd24a';
export const RED = '#ff4d4d';
export const PANEL = 'rgba(10, 5, 2, 0.58)';
export const FONT = "'Rajdhani', 'Saira Condensed', 'Arial Narrow', system-ui, sans-serif";

export function say(ctx, text, x, y, size, { color = INK, weight = 600, align = 'left', baseline = 'middle', glow = false } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.24);
  ctx.strokeStyle = 'rgba(10, 4, 0, 0.88)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = size * 0.35;
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  if (glow) {                       // only for the few things that must pop (alerts, the target)
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.5;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

/** Dark rounded backing plate behind a group of readouts. */
export function plate(ctx, x, y, w, h, { fill = PANEL, edge = null, radius } = {}) {
  const r = radius ?? Math.min(w, h) * 0.12;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** Thin L-shaped corners around a box, the HUD's main framing device. */
export function brackets(ctx, x, y, w, h, len, color = AMBER_SOFT, lineWidth = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(cx + dx * len, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * len);
  }
  ctx.stroke();
}

/** Segmented bar, like the suit gauges. */
export function bar(ctx, x, y, w, h, fraction, { segments = 22, color = AMBER } = {}) {
  const gap = Math.max(1, w / segments / 5);
  const sw = (w - gap * (segments - 1)) / segments;
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * segments);
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < lit ? color : 'rgba(255, 181, 71, 0.18)';
    ctx.fillRect(x + i * (sw + gap), y, sw, h);
  }
}

export function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  const words = String(text).split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const trial = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) {         // out of room: end the last line with an ellipsis
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[,;:.]?$/, '')}…`;
        return lines;
      }
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** "6h 05m" */
export function hm(minutes) {
  const m = Math.max(0, Math.round(minutes ?? 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
