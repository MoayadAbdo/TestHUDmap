import { offsetM } from './geo.js';

const rad = (d) => (d * Math.PI) / 180;

/** A point's position relative to the walker: metres forward and to the right, given the walker's heading. */
export function relativeTo(walker, headingDeg, point, r) {
  const { east, north } = offsetM(walker, point, r);
  const h = rad(headingDeg);
  return { forward: east * Math.sin(h) + north * Math.cos(h), right: east * Math.cos(h) - north * Math.sin(h) };
}

/**
 * Where a spot on the ground appears in the camera view: camera eyeHeightM above the ground, tilted pitchDeg
 * (up +). centerY is the middle of the view (horizonY is the old name, for a level camera).
 * Returns null if it is behind the walker or too close to see.
 */
export function projectGround({ forward, right }, { centerX, centerY, horizonY, focalPx, pitchDeg = 0, eyeHeightM = 1.6, nearM = 1.5 }) {
  if (forward < nearM) return null;
  const p = rad(pitchDeg);
  const depth = forward * Math.cos(p) - eyeHeightM * Math.sin(p);
  if (depth < 0.5) return null;
  const down = forward * Math.sin(p) + eyeHeightM * Math.cos(p);
  return { x: centerX + (focalPx * right) / depth, y: (centerY ?? horizonY) + (focalPx * down) / depth, scale: focalPx / depth };
}

/** Screen row of the horizon for a camera tilted pitchDeg (up +). */
export const horizonRow = (centerY, focalPx, pitchDeg) => centerY + focalPx * Math.tan(rad(pitchDeg));

export const focalForFov = (widthPx, fovDeg) => widthPx / 2 / Math.tan(rad(fovDeg) / 2);
