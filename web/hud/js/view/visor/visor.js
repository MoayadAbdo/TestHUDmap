import { drawStopCard } from './card.js';
import { drawCompass } from './compass.js';
import { drawVisorFrame } from './frame.js';
import { drawGroundGuide } from './ground.js';
import { drawMiniMap } from './minimap.js';
import { drawAlerts, drawMessage, drawNextStop, drawVoice, drawWaiting } from './overlay.js';
import { drawBiosigns, drawComms, drawIntegrity, drawLocation, drawRadiation, drawSuit } from './panels.js';
import { AMBER, RED } from './style.js';

/** One eye of the amber helmet visor. Sizes follow the eye's short side; rows follow its height. */
export function drawVisorHud(ctx, w, h, s, images) {
  const u = Math.min(w, h) / 100;
  const row = h / 100;
  const left = Math.max(4 * u, w * 0.05);
  const right = w - left;
  const cx = w / 2;

  // side panels are about 27u wide, the pin label about 8u each side: the guide only shows in the clear middle
  if (!s.card && !s.waiting) drawGroundGuide(ctx, w, h, u, s, { minX: left + 36 * u, maxX: right - 36 * u });
  drawVisorFrame(ctx, w, h, { vr: s.view === 'vr' });

  drawCompass(ctx, cx, 15 * row, Math.min(w * 0.46, 64 * u), u, s.heading ?? 0, s.targetBearing, s.mustReturn ? RED : AMBER);
  const alertRows = drawAlerts(ctx, cx, 24 * row, u, s);
  drawMessage(ctx, cx, 24 * row + (alertRows * 3.6 + 1) * u, u, w, s.message);

  drawLocation(ctx, left, 17 * row, u, s);
  drawSuit(ctx, left, 40 * row, u, s);
  drawRadiation(ctx, left, 58 * row, u, s);
  drawBiosigns(ctx, left, 66 * row, u, s);

  drawComms(ctx, right, 14 * row, u, s);
  drawMiniMap(ctx, right - 13 * u, 40 * row, 12 * u, u, s);
  drawIntegrity(ctx, right, 58 * row, u, s);

  if (s.card) drawStopCard(ctx, w, h, u, s.card, images.get(s.card.photo));
  else if (s.waiting) drawWaiting(ctx, cx, h / 2, u, s.waiting);
  else drawNextStop(ctx, cx, 72 * row, u, s);
  drawVoice(ctx, cx, 83 * row, u, w, s);
}
