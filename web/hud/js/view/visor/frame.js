import { ACCENT_FAINT } from './style.js';

/** Helmet rim at the top and bottom, a dark vignette, and a faint amber tint over the view. */
export function drawVisorFrame(ctx, w, h, { vr = false } = {}) {
  if (vr) {                       // VR box: lenses already frame the view; keep only the faint amber tint
    ctx.fillStyle = 'rgba(120, 160, 255, 0.05)';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(120, 160, 255, 0.05)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#02050d';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.13);
  ctx.quadraticCurveTo(w / 2, -h * 0.03, 0, h * 0.13);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  ctx.lineTo(w, h * 0.9);
  ctx.quadraticCurveTo(w / 2, h * 1.04, 0, h * 0.9);
  ctx.fill();

  ctx.strokeStyle = ACCENT_FAINT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w, h * 0.13);
  ctx.quadraticCurveTo(w / 2, -h * 0.03, 0, h * 0.13);
  ctx.moveTo(w, h * 0.9);
  ctx.quadraticCurveTo(w / 2, h * 1.04, 0, h * 0.9);
  ctx.stroke();
}
