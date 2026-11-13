import { creditLine } from '../../core/mission-info.js';
import { AMBER, AMBER_FAINT, AMBER_SOFT, brackets, say, wrap } from './style.js';

/** Stop card styled as the wrist tablet in the reference: dark screen, amber text, photo on the left. */
export function drawStopCard(ctx, w, h, u, card, photo) {
  const cw = Math.min(w * 0.56, 78 * u);
  const ch = Math.min(h * 0.5, 46 * u);
  const x = (w - cw) / 2;
  const y = h * 0.24;
  ctx.fillStyle = 'rgba(14, 8, 3, 0.86)';
  ctx.fillRect(x, y, cw, ch);
  ctx.strokeStyle = AMBER_FAINT;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, cw, ch);
  brackets(ctx, x - u, y - u, cw + 2 * u, ch + 2 * u, 2.2 * u, AMBER);

  const pad = 2.2 * u;
  say(ctx, `STOP ${card.id}`, x + pad, y + pad + 0.6 * u, 2 * u, { color: AMBER_SOFT, weight: 700 });
  say(ctx, card.name.toUpperCase(), x + pad, y + pad + 3.6 * u, 3.6 * u, { weight: 700 });

  let textX = x + pad;
  const top = y + pad + 7 * u;
  if (photo?.complete && photo.naturalWidth) {
    const pw = cw * 0.34;
    const ph = ch - (top - y) - pad;
    const scale = Math.max(pw / photo.naturalWidth, ph / photo.naturalHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + pad, top, pw, ph);
    ctx.clip();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(photo, x + pad + (pw - photo.naturalWidth * scale) / 2, top + (ph - photo.naturalHeight * scale) / 2,
      photo.naturalWidth * scale, photo.naturalHeight * scale);
    ctx.globalAlpha = 1;
    const credit = creditLine(card.photo_credit);   // clipped to the photo
    if (credit) say(ctx, credit, x + pad + 0.6 * u, top + ph - 1.2 * u, 1.5 * u, { color: AMBER_SOFT, weight: 500 });
    ctx.restore();
    ctx.strokeStyle = AMBER_FAINT;
    ctx.strokeRect(x + pad, top, pw, ph);
    textX = x + pad * 2 + pw;
  }

  say(ctx, 'TAP OR C TO CLOSE  ·  CLOSES WHEN YOU LEAVE THE STOP', x + cw / 2, y + ch - 1.2 * u, 1.6 * u, { align: 'center', color: AMBER_SOFT, weight: 600 });
  const tw = x + cw - pad - textX;
  let ty = top + 0.8 * u;
  for (const [label, value, lines] of [['TASK', card.task, 2], ['HAZARD', card.hazard, 2], ['SCIENCE', card.science, 4]]) {
    if (!value) continue;
    say(ctx, label, textX, ty, 1.9 * u, { color: AMBER_SOFT, weight: 700 });
    ty += 2.8 * u;
    ctx.font = `500 ${2.3 * u}px Rajdhani, system-ui, sans-serif`;
    for (const line of wrap(ctx, value, tw, lines)) {
      say(ctx, line, textX, ty, 2.3 * u, { weight: 500, blur: u * 0.6 });
      ty += 2.8 * u;
    }
    ty += 0.8 * u;
  }
}
