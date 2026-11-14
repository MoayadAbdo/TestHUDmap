import { creditLine } from '../../core/mission-info.js';
import { ACCENT, ACCENT_SOFT, CAUTION, FONT, GLASS, INK, NAV, brackets, plate, say, wrap } from './style.js';

/**
 * Stop card, like a wrist tablet, in its own fixed slot: the right column (the side panels there step aside while
 * it's open), so it never covers the arrow, the path or the oxygen. Top to bottom: name, photo, TASK, HAZARD, SCIENCE.
 * The text is fitted to the card: lines that don't fit end with "…" instead of running off the edge.
 */
export function drawStopCard(ctx, slot, u, card, photo, { sample = null } = {}) {
  const U = u * 0.78;                                   // everything inside a bit smaller than the visor text
  const { x, y, w: cw } = slot;
  const pad = 2.4 * U;
  const tw = cw - 2 * pad;
  const ops = [];                                       // lay everything out first, so the card is only as tall as it needs
  const text = (t, tx, ty, size, opts) => ops.push(() => say(ctx, t, tx, ty, size, opts));

  text(`STOP ${card.id}`, x + pad, y + pad + 0.4 * U, 1.9 * U, { color: ACCENT_SOFT, weight: 600 });
  if (sample) {                                         // science sample for this stop: done, or how to take it
    const done = sample.done;
    text(done ? '✓ SAMPLE LOGGED' : sample.scan ? '◎ LOOK AT THE ROCK 2 s' : '◎ SAMPLE: PHOTO',
      x + cw - pad, y + pad + 0.4 * U, 1.7 * U, { align: 'right', color: NAV, weight: 600 });
  }
  ctx.font = `600 ${3.6 * U}px ${FONT}`;
  const [name] = wrap(ctx, card.name.toUpperCase(), tw, 1);
  text(name, x + pad, y + pad + 3.8 * U, 3.6 * U, { color: NAV, weight: 600 });

  let ty = y + pad + 7.2 * U;
  if (photo?.complete && photo.naturalWidth) {
    const ph = Math.min(slot.h * 0.3, tw * 0.62);
    const top = ty;
    ops.push(() => {
      const scale = Math.max(tw / photo.naturalWidth, ph / photo.naturalHeight);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + pad, top, tw, ph);
      ctx.clip();
      ctx.drawImage(photo, x + pad + (tw - photo.naturalWidth * scale) / 2, top + (ph - photo.naturalHeight * scale) / 2,
        photo.naturalWidth * scale, photo.naturalHeight * scale);
      ctx.restore();
      ctx.strokeStyle = ACCENT_SOFT;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, top, tw, ph);
    });
    ty += ph;
    const credit = creditLine(card.photo_credit);   // under the photo, never over it
    if (credit) {
      ctx.font = `500 ${1.4 * U}px ${FONT}`;
      const [line] = wrap(ctx, credit, tw, 1);
      text(line, x + pad, ty + 1.4 * U, 1.4 * U, { color: ACCENT_SOFT, weight: 500 });
    }
    ty += 3.6 * U;
  }

  // TASK first and largest (what to do now), then the hazard in caution colour, then science in what room is left
  const bottom = y + slot.h - 3.4 * U;
  const sections = [['TASK', card.task, 2.4, INK, 3], ['HAZARD', card.hazard, 2.2, CAUTION, 2], ['SCIENCE', card.science, 2.05, INK, 8]];
  for (const [label, value, size, color, maxLines] of sections) {
    if (!value) continue;
    const lineH = size * 1.22 * U;
    const roomLines = Math.floor((bottom - (ty + 2.8 * U)) / lineH);
    if (roomLines < 1) break;
    text(label, x + pad, ty, 1.7 * U, { color: ACCENT_SOFT, weight: 600 });
    ty += 2.8 * U;
    ctx.font = `600 ${size * U}px ${FONT}`;
    for (const line of wrap(ctx, value, tw, Math.min(maxLines, roomLines))) {
      text(line, x + pad, ty, size * U, { color, weight: 600 });
      ty += lineH;
    }
    ty += 1 * U;
  }

  const ch = Math.min(slot.h, ty - y + 3.4 * U);
  plate(ctx, x, y, cw, ch, { fill: GLASS, edge: ACCENT_SOFT, radius: 1.2 * U });
  brackets(ctx, x - U, y - U, cw + 2 * U, ch + 2 * U, 2.2 * U, ACCENT);
  for (const op of ops) op();
  say(ctx, 'TAP / C TO CLOSE', x + cw / 2, y + ch - 1.6 * U, 1.6 * U, { align: 'center', color: ACCENT_SOFT, weight: 600 });
}
