import { ACCENT, ACCENT_SOFT, CAUTION, INK, NAV, brackets, plate, say, wrap } from './style.js';

/**
 * "What's here?" card (from the voice agent or the H key): the most important facts about this spot,
 * from the real layers and Curiosity's findings, with the sources at the bottom.
 * Sits bottom-left like the stop card, so the view ahead stays clear; its height fits the facts.
 */
export function drawInfoCard(ctx, w, h, u0, info) {
  const u = u0 * 0.82;
  const cw = Math.min(w * 0.5, 66 * u0);
  const pad = 2.4 * u;
  const size = 2.4;
  const lineH = size * 1.2 * u;
  const tw = cw - 2 * pad - 4 * u;

  // lay the facts out first, so the card is only as tall as they need
  ctx.font = `600 ${size * u}px 'Barlow Semi Condensed', 'Arial Narrow', system-ui, sans-serif`;
  const rows = info.lines.map((line) => ({ line, parts: wrap(ctx, line.text, tw, 2) }));
  const head = 8 * u, foot = 5.4 * u;
  const body = rows.reduce((sum, r) => sum + r.parts.length * lineH + 0.6 * u, 0);
  const ch = Math.min(h * 0.6, head + body + foot + pad);
  const x = Math.max(4 * u0, w * 0.05);
  const y = h * 0.9 - ch;
  plate(ctx, x, y, cw, ch, { fill: 'rgba(5, 11, 26, 0.94)', edge: 'rgba(95, 224, 143, 0.5)', radius: 1.2 * u });
  brackets(ctx, x - u, y - u, cw + 2 * u, ch + 2 * u, 2.2 * u, NAV);

  say(ctx, 'HERE', x + pad, y + pad + 0.4 * u, 1.9 * u, { color: ACCENT_SOFT, weight: 600 });
  say(ctx, info.title.toUpperCase(), x + pad, y + pad + 3.6 * u, 3.6 * u, { color: NAV, weight: 600 });

  const bottom = y + ch - foot;
  let ty = y + pad + head;
  for (const { line, parts } of rows) {
    if (ty > bottom) break;
    const color = line.kind === 'slope' ? CAUTION : line.kind === 'look_for' ? ACCENT : INK;
    say(ctx, line.icon, x + pad, ty, size * u, { color });
    for (const part of parts) {
      if (ty > bottom) break;
      say(ctx, part, x + pad + 4 * u, ty, size * u, { color, weight: 600 });
      ty += lineH;
    }
    ty += 0.6 * u;
  }

  ctx.font = `500 ${1.5 * u}px 'Barlow Semi Condensed', 'Arial Narrow', system-ui, sans-serif`;
  const [src] = wrap(ctx, info.sources.join(' · '), cw - 2 * pad, 1);
  say(ctx, src, x + pad, y + ch - 3.6 * u, 1.5 * u, { color: ACCENT_SOFT, weight: 500 });
  say(ctx, 'TAP / C TO CLOSE  ·  CLOSES BY ITSELF', x + cw / 2, y + ch - 1.4 * u, 1.6 * u, { align: 'center', color: ACCENT_SOFT, weight: 600 });
}
