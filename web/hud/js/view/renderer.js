import { drawBackground, drawHud } from './draw-hud.js';
import { eyeRects } from './vr-layout.js';

/** Draws the background + HUD once (hand-held) or twice side by side (VR box) every frame. */
export function createRenderer({ canvas, getFrame, view = 'vr', maxPixelRatio = 1.5, win = window }) {
  const ctx = canvas.getContext('2d');
  // what Ground Control sees: one eye, copied every frame (live.js streams this canvas)
  const streamCanvas = document.createElement('canvas');
  streamCanvas.id = 'hud-stream';
  streamCanvas.width = 960; streamCanvas.height = 540;
  streamCanvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;pointer-events:none';
  document.body.appendChild(streamCanvas);
  const streamCtx = streamCanvas.getContext('2d');
  const images = new Map();
  let running = false;
  let currentView = view;

  // stop photos: load once, and try again every few seconds if a load failed (weak connection in the field)
  const RETRY_MS = 4000;
  const tried = new Map();
  function photo(url) {
    if (!url) return;
    const img = images.get(url);
    const failed = img?.complete && !img.naturalWidth;
    if (img && !(failed && performance.now() - tried.get(url) > RETRY_MS)) return;
    const next = new Image();
    next.decoding = 'async';
    next.src = url;
    images.set(url, next);
    tried.set(url, performance.now());
  }

  function resize() {
    const ratio = Math.min(win.devicePixelRatio || 1, maxPixelRatio);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
  }

  function frame() {
    if (!running) return;
    if (canvas.width !== Math.round(canvas.clientWidth * Math.min(win.devicePixelRatio || 1, maxPixelRatio))) resize();
    const { background, hud } = getFrame();
    hud.view = currentView;
    if (hud.card) photo(hud.card.photo);
    const rects = eyeRects(canvas.width, canvas.height, currentView);
    if (rects.length > 1) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    for (const r of rects) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.translate(r.x, r.y);
      drawBackground(ctx, r.w, r.h, background);
      drawHud(ctx, r.w, r.h, hud, images);
      ctx.restore();
    }
    // Ground Control gets ONE view (the left eye), not the two-eye split
    const e = rects[0], sw = 960, sh = Math.round((e.h / e.w) * sw);
    if (streamCanvas.width !== sw || streamCanvas.height !== sh) { streamCanvas.width = sw; streamCanvas.height = sh; }
    streamCtx.drawImage(canvas, e.x, e.y, e.w, e.h, 0, 0, sw, sh);
    win.requestAnimationFrame(frame);
  }

  return {
    start() {
      running = true;
      resize();
      win.addEventListener('resize', resize);
      win.requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
    setView(next) {
      currentView = next;
    },
    get view() {
      return currentView;
    },
    /** Load the stop photos at the start, so the card isn't blank on a weak connection. */
    preload(urls) {
      urls.forEach(photo);
    },
  };
}
