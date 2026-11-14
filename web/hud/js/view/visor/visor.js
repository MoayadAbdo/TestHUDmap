import { drawStopCard } from './card.js';
import { drawInfoCard } from './info-card.js';
import { drawCompass } from './compass.js';
import { drawDangerSigns, drawEdgeGlow, drawPathProfile } from './dangers.js';
import { drawScanProgress, drawScanTarget } from './science.js';
import { drawVisorFrame } from './frame.js';
import { drawGroundGuide } from './ground.js';
import { drawMiniMap } from './minimap.js';
import { drawAlerts, drawDirectionArrow, drawFooter, drawMessage, drawNextStop, drawVoice, drawWaiting } from './overlay.js';
import {
  PANEL_W_U, drawBiosigns, drawComms, drawDelayTag, drawIntegrity, drawLayer, drawLocation,
  drawRadiation, drawSuit, drawVitals,
} from './panels.js';
import { ACCENT, NAV, PANEL, RED, plate } from './style.js';


/**
 * One eye of the helmet visor. Sizes follow the eye's short side; rows follow its height.
 *
 * Two levels of detail, so the astronaut isn't flooded with numbers while walking:
 *   focus (default) — compass, where to go (arrow, path, next stop), oxygen time, radiation, temperature,
 *                     mini-map. Alerts appear as one big banner with what to do.
 *   full            — every panel (location, suit, comms, body, suit integrity, map layer). I key / pad X / Ground Control.
 */
export function drawVisorHud(ctx, w, h, s, images) {
  const u = Math.min(w, h) / 100;
  const row = h / 100;
  const left = Math.max(4 * u, w * 0.05);
  const right = w - left;
  const cx = w / 2;
  // level 0..1: how much of the full suit display shows (standing still or pinned on; see core/detail-auto.js)
  const level = s.detailLevel ?? (s.detail === 'full' ? 1 : 0);
  const full = level > 0.5;
  const navColor = s.mustReturn ? RED : NAV;

  // the guide stays clear of the side panels (full view) or only of the screen edge (focus view, panels are up top)
  // the floating stop pin (it rides high in the view) always keeps out of the side columns
  const edge = full ? (PANEL_W_U + 1) * u : 2 * u;
  const pinEdge = (PANEL_W_U + 1) * u;
  if (!s.waiting) drawGroundGuide(ctx, w, h, u, s, { minX: left + edge, maxX: right - edge }, { minX: left + pinEdge + 8 * u, maxX: right - pinEdge - 8 * u });
  if (s.dangers?.show?.signs) drawDangerSigns(ctx, w, h, u, s, { minX: left + edge, maxX: right - edge });
  drawScanTarget(ctx, w, h, u, s, { minX: left + edge, maxX: right - edge });
  drawVisorFrame(ctx, w, h, { vr: s.view === 'vr' });
  if (s.dangers?.show?.glow) drawEdgeGlow(ctx, w, h, u, s);

  drawCompass(ctx, cx, 15 * row, Math.min(w * 0.46, 64 * u), u, s.heading ?? 0, s.targetBearing, navColor);

  if (level > 0) {                         // every panel, fading in / out
    ctx.globalAlpha = level;
    plate(ctx, left - 2 * u, 13 * row, 30 * u, 74 * row, { fill: PANEL, radius: 1.2 * u });
    plate(ctx, right - 28 * u, 11 * row, 30 * u, 78 * row, { fill: PANEL, radius: 1.2 * u });
    drawLocation(ctx, left, 17 * row, u, s);
    drawSuit(ctx, left, 40 * row, u, s);
    drawRadiation(ctx, left, 58 * row, u, s);
    drawBiosigns(ctx, left, 66 * row, u, s);
    drawComms(ctx, right, 14 * row, u, s);
    drawIntegrity(ctx, right, 55 * row, u, s);
    drawLayer(ctx, right, 75.5 * row, u, s.layer, { compact: true });
  }
  if (level < 1) {                         // while walking: the light view
    ctx.globalAlpha = 1 - level;
    // one walking view for both the hand-held screen and the VR box (identical, just scaled to the eye)
    drawVitals(ctx, left, 16 * row, u, s);
    const mapR = 11 * u;
    drawDelayTag(ctx, right - mapR - 1 * u, 16 * row + 2 * mapR + 5 * u, u, s);
    if (s.layer) drawLayer(ctx, right, 16 * row + 2 * mapR + 11 * u, u, s.layer);
  }
  ctx.globalAlpha = 1;
  // one mini-map, gliding between its walking spot and its spot in the full panels (never two at once)
  const mix = (a, b) => a + (b - a) * level;
  const mapR = mix(11 * u, 10.5 * u);
  drawMiniMap(ctx, mix(right - 12 * u, right - 12 * u), mix(16 * row + 11 * u, 37 * row), mapR, u, s);

  if (s.card) drawStopCard(ctx, w, h, u, s.card, images.get(s.card.photo), { sample: s.cardSample });
  else if (s.info) drawInfoCard(ctx, w, h, u, s.info);
  else if (s.waiting) drawWaiting(ctx, cx, h / 2, u, s.waiting);
  else drawNextStop(ctx, cx, 74 * row, u, s);
  const profile = Boolean(s.dangers?.show?.profile && !s.card && !s.info && !s.waiting);
  if (profile) drawPathProfile(ctx, cx, 81.5 * row, u, s);
  drawScanProgress(ctx, cx, h / 2, u, s);
  // alerts and messages go on top of everything, including an open stop card
  const alertH = drawAlerts(ctx, cx, 21 * row, u, s);
  drawMessage(ctx, cx, 21 * row + (alertH ? alertH + 2.4 : 1.5) * u, u, w, s.message);
  // always visible: which way to go along the path (under the card when one is open)
  // the stop card and the info card sit bottom-left: the arrow and the AI's words move right while one is open
  const side = Boolean(s.card || s.info);
  if (!s.waiting) drawDirectionArrow(ctx, side ? w * 0.66 : cx, 64 * row, u, s.arrowDeg, navColor);
  drawVoice(ctx, side ? w * 0.73 : cx, (profile ? 89.5 : 86) * row, u, side ? w * 0.8 : w, s);
  if (s.view !== 'vr' && !s.waiting && !side) drawFooter(ctx, left, 88 * row, u, s);
}

export { ACCENT };
