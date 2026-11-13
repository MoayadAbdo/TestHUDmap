import { creditLine } from '../../core/mission-info.js';
import { AMBER, AMBER_SOFT, CAUTION, INK, NAV, brackets, plate, say, wrap } from './style.js';

/**
 * Stop card, like a wrist tablet: photo on the left, then TASK (what to do), HAZARD, SCIENCE.
 * The text is fitted to the card: lines that don't fit end with "…" instead of running off the edge.
 */
export function drawStopCard(ctx, w, h, u, card, photo, { underAlert = false, sample = null } = {}) {
  // an alert banner keeps the top of the view: the card moves down and gets a little shorter
  const cw = Math.min(w * 0.58, 80 * u);
  const ch = Math.min(h * (underAlert ? 0.44 : 0.52), 48 * u);
  const x = (w - cw) / 2;
  const y = h * (underAlert ? 0.32 : 0.22);
  plate(ctx, x, y, cw, ch, { fill: 'rgba(12, 7, 3, 0.94)', edge: 'rgba(255, 181, 71, 0.45)', radius: 1.2 * u });
  brackets(ctx, x - u, y - u, cw + 2 * u, ch + 2 * u, 2.2 * u, AMBER);

  const pad = 2.4 * u;
  say(ctx, `STOP ${card.id}`, x + pad, y + pad + 0.4 * u, 1.9 * u, { color: AMBER_SOFT, weight: 700 });
  // science sample for this stop: done, or how to take it
  if (sample) {
    const done = sample.done;
    say(ctx, done ? '✓ SAMPLE LOGGED' : sample.scan ? '◎ SAMPLE: LOOK AT THE GLOWING ROCK 2 s' : '◎ SAMPLE: PHOTO ON ARRIVAL',
      x + cw - pad, y + pad + 0.4 * u, 1.9 * u, { align: 'right', color: done ? '#4ade80' : NAV, weight: 800 });
  }
  say(ctx, card.name.toUpperCase(), x + pad, y + pad + 3.6 * u, 3.8 * u, { color: NAV, weight: 700 });

  const top = y + pad + 7.4 * u;
  const footer = 3 * u;
  const bottom = y + ch - footer;
  let textX = x + pad;
  if (photo?.complete && photo.naturalWidth) {
    const pw = cw * 0.34;
    const creditH = 2.4 * u;
    const ph = bottom - top - creditH;
    const scale = Math.max(pw / photo.naturalWidth, ph / photo.naturalHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + pad, top, pw, ph);
    ctx.clip();
    ctx.drawImage(photo, x + pad + (pw - photo.naturalWidth * scale) / 2, top + (ph - photo.naturalHeight * scale) / 2,
      photo.naturalWidth * scale, photo.naturalHeight * scale);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 181, 71, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + pad, top, pw, ph);
    const credit = creditLine(card.photo_credit);   // under the photo, never over it
    if (credit) {
      ctx.font = `500 ${1.45 * u}px Rajdhani, system-ui, sans-serif`;
      const [line] = wrap(ctx, credit, pw, 1);
      say(ctx, line, x + pad, top + ph + 1.3 * u, 1.45 * u, { color: AMBER_SOFT, weight: 500 });
    }
    textX = x + pad * 2 + pw;
  }

  // TASK first and largest (what to do now), then the hazard in caution colour, then science in what room is left
  const tw = x + cw - pad - textX;
  const sections = [['TASK', card.task, 2.5, INK, 3], ['HAZARD', card.hazard, 2.3, CAUTION, 2], ['SCIENCE', card.science, 2.15, INK, 8]];
  let ty = top + 0.6 * u;
  for (const [label, value, size, color, maxLines] of sections) {
    if (!value) continue;
    const lineH = size * 1.22 * u;
    const roomLines = Math.floor((bottom - (ty + 2.8 * u)) / lineH);
    if (roomLines < 1) break;
    say(ctx, label, textX, ty, 1.8 * u, { color: AMBER_SOFT, weight: 700 });
    ty += 2.8 * u;
    ctx.font = `600 ${size * u}px Rajdhani, system-ui, sans-serif`;
    for (const line of wrap(ctx, value, tw, Math.min(maxLines, roomLines))) {
      say(ctx, line, textX, ty, size * u, { color, weight: 600 });
      ty += lineH;
    }
    ty += 1 * u;
  }

  say(ctx, 'TAP / C TO CLOSE  ·  CLOSES WHEN YOU WALK ON', x + cw / 2, y + ch - 1.5 * u, 1.6 * u, { align: 'center', color: AMBER_SOFT, weight: 600 });
}
