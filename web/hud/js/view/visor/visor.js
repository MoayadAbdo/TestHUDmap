import { drawStopCard } from './card.js';
import { drawCompass } from './compass.js';
import { drawVisorFrame } from './frame.js';
import { drawGroundGuide } from './ground.js';
import { drawMiniMap } from './minimap.js';
import { drawAlerts, drawDirectionArrow, drawMessage, drawNextStop, drawVoice, drawWaiting } from './overlay.js';
import { PANEL_W_U, drawBiosigns, drawComms, drawIntegrity, drawLayer, drawLinkChip, drawLocation, drawOxygenChip, drawRadiation, drawSuit } from './panels.js';
import { AMBER, AMBER_SOFT, RED, say } from './style.js';

/**
 * How much of the full suit display to show (0..1). Hand-held and Ground Control: always all of it.
 * VR box: a clean view while looking ahead; the suit panels fade in as you look down (like checking a chest display).
 */
export function suitDetail(view, pitchDeg = 0) {
  if (view !== 'vr') return 1;
  const t = Math.max(0, Math.min(1, (-pitchDeg - LOOK_DOWN_START) / (LOOK_DOWN_FULL - LOOK_DOWN_START)));
  return t * t * (3 - 2 * t);
}
const LOOK_DOWN_START = 12;   // degrees below level: panels start to appear
const LOOK_DOWN_FULL = 22;    // fully shown

/** One eye of the amber helmet visor. Sizes follow the eye's short side; rows follow its height. */
export function drawVisorHud(ctx, w, h, s, images) {
  const u = Math.min(w, h) / 100;
  const row = h / 100;
  const left = Math.max(4 * u, w * 0.05);
  const right = w - left;
  const cx = w / 2;
  const detail = suitDetail(s.view, s.pitch);
  const color = s.mustReturn ? RED : AMBER;

  // the guide stays clear of whatever panels are showing; the pin also needs room for its label (~8u each side)
  const edge = detail > 0.5 ? (PANEL_W_U + 1) * u : 2 * u;
  if (!s.waiting) drawGroundGuide(ctx, w, h, u, s, { minX: left + edge, maxX: right - edge }, { minX: left + edge + 8 * u, maxX: right - edge - 8 * u });
  drawVisorFrame(ctx, w, h, { vr: s.view === 'vr' });

  drawCompass(ctx, cx, 15 * row, Math.min(w * 0.46, 64 * u), u, s.heading ?? 0, s.targetBearing, color);
  const alertRows = drawAlerts(ctx, cx, 24 * row, u, s);
  drawMessage(ctx, cx, 24 * row + (alertRows * 3.6 + 1) * u, u, w, s.message);

  if (detail < 1) {                        // clean VR view: just oxygen and the link, small, in the top corners
    ctx.globalAlpha = 1 - detail;
    drawOxygenChip(ctx, left, 9 * row, u, s);
    drawLinkChip(ctx, right, 9 * row, u, s);
    ctx.globalAlpha = 1;
  }
  if (detail > 0) {
    ctx.globalAlpha = detail;
    drawLocation(ctx, left, 17 * row, u, s);
    drawSuit(ctx, left, 40 * row, u, s);
    drawRadiation(ctx, left, 58 * row, u, s);
    drawBiosigns(ctx, left, 66 * row, u, s);
    drawComms(ctx, right, 14 * row, u, s);
    drawMiniMap(ctx, right - 13 * u, 40 * row, 12 * u, u, s);
    drawIntegrity(ctx, right, 58 * row, u, s);
    drawLayer(ctx, right, 79 * row, u, s.layer);
    ctx.globalAlpha = 1;
  }

  if (s.card) drawStopCard(ctx, w, h, u, s.card, images.get(s.card.photo));
  else if (s.waiting) drawWaiting(ctx, cx, h / 2, u, s.waiting);
  else drawNextStop(ctx, cx, 72 * row, u, s);
  // always visible: which way to go along the path (below the card when one is open)
  if (!s.waiting) drawDirectionArrow(ctx, cx, (s.card ? 75 : 64) * row, u, s.arrowDeg, color);
  drawVoice(ctx, cx, 83 * row, u, w, s);
  if (s.view === 'vr' && detail === 0 && !s.card) say(ctx, 'LOOK DOWN FOR SUIT', cx, 93 * row, 1.7 * u, { align: 'center', color: AMBER_SOFT, weight: 600 });
}
