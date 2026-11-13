import { wrap180, wrap360 } from './geo.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

const HOLD_FLAT = 0.35;         // looking almost straight up or down (> ~70°): keep the last direction
const CALIBRATE_PITCH = 30;     // learn north only while looking roughly level
const MAX_JUMP = 45;            // a compass reading this far off is a glitch (iOS flips it by 180° near level)
const GAIN = 0.05;              // learn north slowly

/** Back-camera direction (east, north, up) from deviceorientation angles (W3C Z-X'-Y''). Continuous in 3D. */
export function cameraDirection(alpha, beta, gamma) {
  if (alpha == null || beta == null || gamma == null) return null;
  const [cA, sA, cB, sB, cG, sG] = [alpha, beta, gamma].flatMap((a) => [Math.cos(rad(a)), Math.sin(rad(a))]);
  return { east: -(cA * sG + sA * sB * cG), north: cA * sB * cG - sA * sG, up: -cB * cG };
}

/**
 * Head pose from the phone's motion: turning (yaw) from the full 3D rotation, so looking up and down never
 * flips it, and pitch (up +). Two ways to say where north is:
 * - startHeading: the first reading faces this way (the 3D Mars starts facing the first stop; no compass needed).
 * - otherwise: Android 'deviceorientationabsolute' is already north-referenced; on iPhone (alpha isn't) north is
 *   learned slowly from the compass reading while looking level, ignoring big jumps.
 */
export function createHeadPose({ startHeading = null } = {}) {
  let offset = null;
  let heading = null;
  let pitch = 0;
  return {
    /** compass: the camera's compass heading if the phone gives one (iPhone webkitCompassHeading + screen turn). */
    update({ alpha, beta, gamma, absolute = false, compass = null }) {
      const d = cameraDirection(alpha, beta, gamma);
      if (!d) return;
      pitch = deg(Math.asin(Math.max(-1, Math.min(1, d.up))));
      const flat = Math.hypot(d.east, d.north);
      if (flat < HOLD_FLAT) return;
      const raw = wrap360(deg(Math.atan2(d.east, d.north)));
      if (startHeading != null) {
        offset ??= wrap180(startHeading - raw);
      } else if (!absolute && compass != null && Math.abs(pitch) < CALIBRATE_PITCH) {
        const want = wrap180(compass - raw);
        if (offset == null) offset = want;
        else if (Math.abs(wrap180(want - offset)) < MAX_JUMP) offset = wrap180(offset + GAIN * wrap180(want - offset));
      }
      heading = wrap360(raw + (offset ?? 0));
    },
    get heading() {
      return heading;
    },
    get pitch() {
      return pitch;
    },
  };
}
