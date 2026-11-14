import { ACCENT, ACCENT_FAINT, ACCENT_SOFT, NAV, PANEL, RED, say } from './style.js';

const RANGE_M = 80;

/** Heading-up mini-map: Curiosity's route (faint dashes), the planned safe path (solid), stops, base, and the walker. */
export function drawMiniMap(ctx, cx, cy, radius, u, s) {
  const scene = s.scene;
  const k = radius / RANGE_M;
  const xy = (p) => [cx + p.right * k, cy - p.forward * k];

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.clip();
  drawPhoto(ctx, cx, cy, radius, s);

  ctx.strokeStyle = ACCENT_FAINT;
  ctx.lineWidth = 1;
  for (const ring of [25, 50]) {
    ctx.beginPath();
    ctx.arc(cx, cy, ring * k, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (scene) {
    ctx.strokeStyle = ACCENT_SOFT;
    ctx.lineWidth = Math.max(1.5, 0.45 * u);
    ctx.setLineDash([0.9 * u, 0.7 * u]);
    ctx.beginPath();
    scene.route.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    if (scene.plan?.length > 1) {                 // the way the arrows lead: around steep ground
      ctx.strokeStyle = s.mustReturn ? RED : NAV;
      ctx.lineWidth = Math.max(2, 0.6 * u);
      ctx.beginPath();
      scene.plan.forEach((p, i) => { const [x, y] = xy(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }

    const [bx, by] = xy(scene.base);
    ctx.strokeStyle = scene.base.isTarget ? RED : ACCENT_SOFT;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 1.1 * u, by - 1.1 * u, 2.2 * u, 2.2 * u);

    for (const stop of scene.stops) {
      const [x, y] = xy(stop);
      if (stop.isTarget) {
        const pulse = 1.6 * u + 0.6 * u * Math.sin(s.timeMs / 250);
        ctx.strokeStyle = NAV;
        ctx.beginPath();
        ctx.arc(x, y, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = stop.visited ? ACCENT_FAINT : stop.isTarget ? NAV : ACCENT_SOFT;
      ctx.beginPath();
      ctx.arc(x, y, (stop.isTarget ? 1.0 : 0.7) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = ACCENT_SOFT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  const north = (-(s.heading ?? 0) * Math.PI) / 180;
  say(ctx, 'N', cx + Math.sin(north) * (radius - 2.2 * u), cy - Math.cos(north) * (radius - 2.2 * u), 2.2 * u, { align: 'center', weight: 600 });

  ctx.fillStyle = ACCENT;
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = u;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 1.6 * u);
  ctx.lineTo(cx + 1.1 * u, cy + 1.2 * u);
  ctx.lineTo(cx, cy + 0.5 * u);
  ctx.lineTo(cx - 1.1 * u, cy + 1.2 * u);
  ctx.fill();
  ctx.shadowBlur = 0;
  say(ctx, `MAP ${RANGE_M} M`, cx, cy + radius + 2.2 * u, 1.7 * u, { align: 'center', color: ACCENT_SOFT, weight: 600 });
}

/**
 * The real HiRISE photo under the mini-map, turned so where you face is up (the map is heading-up).
 * s.mapGeo = { mars: [lat, lon], heading (deg on Mars), bounds, W, H (metres), marsPerMetre }; s.mapPhoto = an Image.
 */
function drawPhoto(ctx, cx, cy, radius, s) {
  const img = s.mapPhoto;
  const g = s.mapGeo;
  if (!img?.complete || !img.naturalWidth || !g) return;
  const { north, south, west, east } = g.bounds;
  const k = (radius / RANGE_M) / (g.marsPerMetre || 1);               // pixels per Mars metre
  const ex = ((g.mars[1] - west) / (east - west)) * g.W;            // walker, metres from the photo's top-left
  const ny = ((north - g.mars[0]) / (north - south)) * g.H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-g.heading * Math.PI) / 180);
  ctx.globalAlpha *= 0.75;
  ctx.drawImage(img, -ex * k, -ny * k, g.W * k, g.H * k);
  ctx.restore();
  ctx.fillStyle = 'rgba(5, 11, 26, 0.35)';                           // keeps the lines and pins readable
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}
