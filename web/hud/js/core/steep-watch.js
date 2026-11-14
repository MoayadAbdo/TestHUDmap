/**
 * Decides when the steep-ground warning is really on. It needs you to be walking, and the steep stretch has to
 * stay ahead for a moment: standing still, or the safe path being redrawn under you, does not raise it.
 */
const HOLD_ON_MS = 1500;     // steep ahead while walking this long: warn
const HOLD_OFF_MS = 3000;    // clear (or stopped) this long: stop warning

export function createSteepWatch({ walkingMps, limitDeg, clock }) {
  let on = false;
  let since = null;
  return {
    /** Call every tick; true while the warning should show. */
    update(slopeDeg, speedMps) {
      const want = slopeDeg > limitDeg && speedMps >= walkingMps;
      if (want === on) { since = null; return on; }
      const t = clock();
      since ??= t;
      if (t - since >= (want ? HOLD_ON_MS : HOLD_OFF_MS)) { on = want; since = null; }
      return on;
    },
    reset() { on = false; since = null; },
  };
}
