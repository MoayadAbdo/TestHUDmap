/**
 * Steps from the phone's motion sensor, so walking in place (or around the room) walks you on the 3D Mars.
 * Each step is a bounce in the total acceleration; turning your head is mostly rotation and stays below the bar.
 */
export const STEP_BAR = 1.3;          // m/s² above the gravity baseline counts as a step
const REARM = 0.4;                    // must drop back under this before the next step
const MIN_GAP_MS = 280;               // faster than ~3.5 steps a second is shaking, not walking
export const WALK_MS = 700;           // after a step you keep walking this long (a normal step takes ~0.55 s)

export function createStepDetector({ onStep = () => {} } = {}) {
  let baseline = 9.81;
  let armed = true;
  let lastStep = -Infinity;
  return {
    /** Acceleration including gravity (m/s²) at time t (ms). */
    update(ax, ay, az, t) {
      if (![ax, ay, az].every(Number.isFinite)) return;
      const mag = Math.hypot(ax, ay, az);
      baseline += 0.02 * (mag - baseline);
      const lift = mag - baseline;
      if (armed && lift > STEP_BAR && t - lastStep > MIN_GAP_MS) {
        lastStep = t;
        armed = false;
        onStep(t);
      } else if (!armed && lift < REARM) {
        armed = true;
      }
    },
    /** Walk forward while the steps keep coming. */
    walking(t) {
      return t - lastStep < WALK_MS;
    },
  };
}
