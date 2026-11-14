/*
 * Visor colours have one meaning each, so the astronaut reads the colour before the words:
 *   INK      numbers and names to read (cool white: readable on bright sky and dark ground)
 *   ACCENT   labels and frames (mission-control blue: never used for data or danger)
 *   NAV      where to go: arrow, path, pin, next stop (green: never used for data)
 *   CAUTION  be careful (steep ground)
 *   RED      act now (return to base, oxygen, radiation)
 * Text is a clean technical face with a thin dark edge (no glow, no heavy outline),
 * and every group sits on a dark plate, so it stays readable over the bright Mars sky.
 */
export const INK = '#f3f6ff';
export const ACCENT = '#8fb3ff';
export const ACCENT_SOFT = 'rgba(143, 179, 255, 0.85)';
export const ACCENT_FAINT = 'rgba(143, 179, 255, 0.26)';
export const NAV = '#5fe08f';
export const CAUTION = '#ffd24a';
export const RED = '#ff4d4d';
export const PANEL = 'rgba(5, 11, 26, 0.62)';           // deep navy
export const PANEL_SOLID = 'rgba(5, 11, 26, 0.94)';
export const EDGE = 'rgba(2, 5, 14, 0.75)';             // the thin dark edge on text
export const FONT = "'Barlow Semi Condensed', 'Arial Narrow', system-ui, sans-serif";

export function say(ctx, text, x, y, size, { color = INK, weight = 500, align = 'left', baseline = 'middle', glow = false } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, size * 0.12);          // thin edge: readable on bright sky, not cartoon-like
  ctx.strokeStyle = EDGE;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = size * 0.15;
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
export function brackets(ctx, x, y, w, h, len, color = ACCENT_SOFT, lineWidth = 1.5) {
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
export function bar(ctx, x, y, w, h, fraction, { segments = 22, color = ACCENT } = {}) {
  const gap = Math.max(1, w / segments / 5);
  const sw = (w - gap * (segments - 1)) / segments;
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * segments);
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < lit ? color : 'rgba(143, 179, 255, 0.16)';
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
