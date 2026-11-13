import { AMBER, AMBER_SOFT, CAUTION, INK, NAV, brackets, plate, say, wrap } from './style.js';

/**
 * "What's here?" card (from the voice agent or the H key): the most important facts about this spot,
 * from the real layers and Curiosity's findings, with the sources at the bottom. Same look as the stop card.
 */
export function drawInfoCard(ctx, w, h, u0, info) {
  // bottom-left like the stop card, so the view ahead stays clear; a little taller for the 5 facts
  const u = u0 * 0.78;
  const cw = Math.min(w * 0.5, 66 * u0);
  const ch = Math.min(h * 0.46, 40 * u0);
  const x = Math.max(4 * u0, w * 0.05);
  const y = h * 0.9 - ch;
  plate(ctx, x, y, cw, ch, { fill: 'rgba(12, 7, 3, 0.94)', edge: 'rgba(79, 227, 234, 0.5)', radius: 1.2 * u });
  brackets(ctx, x - u, y - u, cw + 2 * u, ch + 2 * u, 2.2 * u, NAV);

  const pad = 2.4 * u;
  say(ctx, 'HERE', x + pad, y + pad + 0.4 * u, 1.9 * u, { color: AMBER_SOFT, weight: 700 });
  say(ctx, info.title.toUpperCase(), x + pad, y + pad + 3.6 * u, 3.6 * u, { color: NAV, weight: 700 });

  const tw = cw - 2 * pad - 4 * u;
  const bottom = y + ch - 6 * u;
  let ty = y + pad + 8 * u;
  const size = 2.25;
  ctx.font = `600 ${size * u}px Rajdhani, system-ui, sans-serif`;
  for (const line of info.lines) {
    if (ty > bottom) break;
    const color = line.kind === 'slope' ? CAUTION : line.kind === 'look_for' ? AMBER : INK;
    say(ctx, line.icon, x + pad, ty, size * u, { color });
    for (const part of wrap(ctx, line.text, tw, 2)) {
      if (ty > bottom) break;
      say(ctx, part, x + pad + 4 * u, ty, size * u, { color, weight: 600 });
      ty += size * 1.2 * u;
    }
    ty += 0.6 * u;
  }

  ctx.font = `500 ${1.5 * u}px Rajdhani, system-ui, sans-serif`;
  const [src] = wrap(ctx, info.sources.join(' · '), cw - 2 * pad, 1);
  say(ctx, src, x + pad, y + ch - 3.6 * u, 1.5 * u, { color: AMBER_SOFT, weight: 500 });
  say(ctx, 'TAP / C TO CLOSE  ·  CLOSES BY ITSELF', x + cw / 2, y + ch - 1.4 * u, 1.6 * u, { align: 'center', color: AMBER_SOFT, weight: 600 });
}
