/*
 * Aerospace holographic vector look (Yara's design). One meaning per colour:
 *   INK      values and numbers (pure white: most contrast)
 *   ACCENT   labels and frames (ice cyan)
 *   NAV      where to go: arrows, path, pin, next stop (same ice cyan as the frames)
 *   CAUTION  be careful (amber, for hazards)
 *   RED      act now (return to base, oxygen, radiation)
 * Thin strokes, lots of empty space, no filled backgrounds; text has a tight glow in its own colour.
 */
export const INK = '#ffffff';
export const ACCENT = '#66fcf1';
export const ACCENT_SOFT = 'rgba(102, 252, 241, 0.5)';
export const ACCENT_FAINT = 'rgba(102, 252, 241, 0.15)';
export const NAV = '#66fcf1';
export const NAV_EDGE = 'rgba(102, 252, 241, 0.45)';
export const GLASS = 'rgba(4, 14, 20, 0.38)';            // see-through backing for cards you read
export const CAUTION = '#ffb300';
export const RED = '#ff4d4d';
export const PANEL = 'rgba(0, 0, 0, 0)';
export const FONT = "'Barlow Semi Condensed', 'Arial Narrow', system-ui, sans-serif";

export function say(ctx, text, x, y, size, { color = INK, weight = 400, align = 'left', baseline = 'middle', glow = true } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.shadowColor = color;                                   // tight optical glow, not blurry
  ctx.shadowBlur = glow ? Math.max(2, size * 0.15) : 0;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

/** Empty space by default; an ultra-thin edge when asked, or a fill when a caller really needs one (alerts). */
export function plate(ctx, x, y, w, h, { fill = PANEL, edge = null, radius } = {}) {
  const r = radius ?? Math.min(w, h) * 0.12;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill !== PANEL) { ctx.fillStyle = fill; ctx.fill(); }
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

/** Thin L-shaped corners around a box, the HUD's main framing device. */
export function brackets(ctx, x, y, w, h, len, color = ACCENT_SOFT, lineWidth = 0.8) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(cx + dx * len, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * len);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Gauge as thin vector slashes instead of chunky blocks. */
export function bar(ctx, x, y, w, h, fraction, { segments = 22, color = ACCENT } = {}) {
  const gap = Math.max(1, w / segments / 5);
  const sw = (w - gap * (segments - 1)) / segments;
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * segments);
  ctx.lineWidth = Math.max(1, sw * 0.5);
  ctx.shadowColor = color;
  for (let i = 0; i < segments; i++) {
    ctx.shadowBlur = i < lit ? 4 : 0;
    ctx.strokeStyle = i < lit ? color : ACCENT_FAINT;
    const lineX = x + i * (sw + gap) + sw / 2;
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + h);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
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
