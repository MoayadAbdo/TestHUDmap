import { wrap180, wrap360 } from './geo.js';

const rad = (d) => (d * Math.PI) / 180;

/**
 * Compass heading of the back camera, from deviceorientationabsolute angles.
 * Uses the full rotation, so it works with the phone upright in the box, in any screen orientation.
 * Returns null when the camera points almost straight up or down.
 */
export function cameraHeading(alpha, beta, gamma) {
  if (alpha == null || beta == null || gamma == null) return null;
  const [cA, sA] = [Math.cos(rad(alpha)), Math.sin(rad(alpha))];
  const [cB, sB] = [Math.cos(rad(beta)), Math.sin(rad(beta))];
  const [cG, sG] = [Math.cos(rad(gamma)), Math.sin(rad(gamma))];
  const east = -(cA * sG + sA * sB * cG);
  const north = -(sA * sG - cA * sB * cG);
  if (Math.hypot(east, north) < 0.2) return null;
  return wrap360((Math.atan2(east, north) * 180) / Math.PI);
}

/** How far the back camera looks up (+) or down (−), degrees, from the same angles (phone upright in the box = 0). */
export function cameraPitch(beta, gamma) {
  if (beta == null || gamma == null) return null;
  const up = -Math.cos(rad(beta)) * Math.cos(rad(gamma));
  return (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI;
}

/** Smooths a jittery heading without jumping at the 0/360 seam. */
export function smoothHeading(previous, next, weight = 0.2) {
  if (previous == null) return next;
  if (next == null) return previous;
  return wrap360(previous + weight * wrap180(next - previous));
}
