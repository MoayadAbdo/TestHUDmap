import { AMBER, AMBER_FAINT, AMBER_SOFT, NAV, PANEL, RED, say } from './style.js';

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

  ctx.strokeStyle = AMBER_FAINT;
  ctx.lineWidth = 1;
  for (const ring of [25, 50]) {
    ctx.beginPath();
    ctx.arc(cx, cy, ring * k, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (scene) {
    ctx.strokeStyle = AMBER_SOFT;
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
    ctx.strokeStyle = scene.base.isTarget ? RED : AMBER_SOFT;
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
      ctx.fillStyle = stop.visited ? AMBER_FAINT : stop.isTarget ? NAV : AMBER_SOFT;
      ctx.beginPath();
      ctx.arc(x, y, (stop.isTarget ? 1.0 : 0.7) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = AMBER_SOFT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  const north = (-(s.heading ?? 0) * Math.PI) / 180;
  say(ctx, 'N', cx + Math.sin(north) * (radius - 2.2 * u), cy - Math.cos(north) * (radius - 2.2 * u), 2.2 * u, { align: 'center', weight: 700 });

  ctx.fillStyle = AMBER;
  ctx.shadowColor = AMBER;
  ctx.shadowBlur = u;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 1.6 * u);
  ctx.lineTo(cx + 1.1 * u, cy + 1.2 * u);
  ctx.lineTo(cx, cy + 0.5 * u);
  ctx.lineTo(cx - 1.1 * u, cy + 1.2 * u);
  ctx.fill();
  ctx.shadowBlur = 0;
  say(ctx, `MAP ${RANGE_M} M`, cx, cy + radius + 2.2 * u, 1.7 * u, { align: 'center', color: AMBER_SOFT, weight: 700 });
}
