import { drawStopCard } from './card.js';
import { drawCompass } from './compass.js';
import { drawVisorFrame } from './frame.js';
import { drawGroundGuide } from './ground.js';
import { drawMiniMap } from './minimap.js';
import { drawAlerts, drawDirectionArrow, drawFooter, drawMessage, drawNextStop, drawVoice, drawWaiting } from './overlay.js';
import {
  PANEL_W_U, drawBiosigns, drawComms, drawDelayTag, drawIntegrity, drawLayer, drawLinkChip, drawLocation, drawOxygenChip,
  drawRadiation, drawSuit, drawVitals,
} from './panels.js';
import { AMBER, AMBER_SOFT, NAV, PANEL, RED, plate, say } from './style.js';

/**
 * VR box only: how far the astronaut looks down (0..1). Looking down shows every panel, like checking a chest display.
 */
export function suitDetail(view, pitchDeg = 0) {
  if (view !== 'vr') return 0;
  const t = Math.max(0, Math.min(1, (-pitchDeg - LOOK_DOWN_START) / (LOOK_DOWN_FULL - LOOK_DOWN_START)));
  return t * t * (3 - 2 * t);
}
const LOOK_DOWN_START = 12;   // degrees below level: panels start to appear
const LOOK_DOWN_FULL = 22;    // fully shown

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
  // full: every panel (I key / Ground Control, or looking down in the VR box)
  // clean: VR box looking ahead, just oxygen and the link (the eye is narrow); focus: hand-held default
  const full = s.detail === 'full' || suitDetail(s.view, s.pitch) > 0.5;
  const clean = s.view === 'vr' && !full;
  const navColor = s.mustReturn ? RED : NAV;

  // the guide stays clear of the side panels (full view) or only of the screen edge (focus view, panels are up top)
  // the floating stop pin (it rides high in the view) always keeps out of the side columns
  const edge = full ? (PANEL_W_U + 1) * u : 2 * u;
  const pinEdge = (PANEL_W_U + 1) * u;
  if (!s.waiting) drawGroundGuide(ctx, w, h, u, s, { minX: left + edge, maxX: right - edge }, { minX: left + pinEdge + 8 * u, maxX: right - pinEdge - 8 * u });
  drawVisorFrame(ctx, w, h, { vr: s.view === 'vr' });

  drawCompass(ctx, cx, 15 * row, Math.min(w * 0.46, 64 * u), u, s.heading ?? 0, s.targetBearing, navColor);

  if (full) {
    plate(ctx, left - 2 * u, 13 * row, 30 * u, 74 * row, { fill: PANEL, radius: 1.2 * u });
    plate(ctx, right - 28 * u, 11 * row, 30 * u, 78 * row, { fill: PANEL, radius: 1.2 * u });
    drawLocation(ctx, left, 17 * row, u, s);
    drawSuit(ctx, left, 40 * row, u, s);
    drawRadiation(ctx, left, 58 * row, u, s);
    drawBiosigns(ctx, left, 66 * row, u, s);
    drawComms(ctx, right, 14 * row, u, s);
    drawMiniMap(ctx, right - 13 * u, 40 * row, 12 * u, u, s);
    drawIntegrity(ctx, right, 58 * row, u, s);
    drawLayer(ctx, right, 79 * row, u, s.layer);
  } else if (clean) {
    drawOxygenChip(ctx, left, 9 * row, u, s);
    drawLinkChip(ctx, right, 9 * row, u, s);
  } else {
    drawVitals(ctx, left, 16 * row, u, s);
    const mapR = 11 * u;
    drawMiniMap(ctx, right - mapR - 1 * u, 16 * row + mapR, mapR, u, s);
    drawDelayTag(ctx, right - mapR - 1 * u, 16 * row + 2 * mapR + 5 * u, u, s);
    if (s.layer) drawLayer(ctx, right, 16 * row + 2 * mapR + 11 * u, u, s.layer);
  }

  if (s.card) drawStopCard(ctx, w, h, u, s.card, images.get(s.card.photo), { underAlert: s.alerts.length > 0 });
  else if (s.waiting) drawWaiting(ctx, cx, h / 2, u, s.waiting);
  else drawNextStop(ctx, cx, 74 * row, u, s);
  // alerts and messages go on top of everything, including an open stop card
  const alertH = drawAlerts(ctx, cx, 21 * row, u, s);
  drawMessage(ctx, cx, 21 * row + (alertH ? alertH + 2.4 : 1.5) * u, u, w, s.message);
  // always visible: which way to go along the path (under the card when one is open)
  const arrowRow = s.card ? (s.alerts.length ? 82 : 78) : 64;   // below the card, which sits lower under an alert
  if (!s.waiting) drawDirectionArrow(ctx, cx, arrowRow * row, u, s.arrowDeg, navColor);
  drawVoice(ctx, cx, 86 * row, u, w, s);
  if (s.view !== 'vr' && !s.waiting) drawFooter(ctx, left, 88 * row, u, s);
  if (clean && !s.card) say(ctx, 'LOOK DOWN FOR SUIT', cx, 93 * row, 1.7 * u, { align: 'center', color: AMBER_SOFT, weight: 600 });
}

export { AMBER };
