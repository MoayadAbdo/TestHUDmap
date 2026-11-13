/** Picks the walk's base from GPS: a ±20 m fix at once, weaker ones after waiting (indoors phones get ±30–60 m). */
export const FIX_STEPS = [[0, 20], [10000, 50], [25000, 120]];
const WEAK_FIX_M = 25;

export function createBaseFix({ clock, steps = FIX_STEPS }) {
  let firstFixAt = null;
  let forced = null;
  return {
    /** The fix to use as base now, or null to keep waiting. */
    choose(position) {
      if (forced) {
        const fix = forced;
        forced = null;
        return fix;
      }
      if (!position) return null;
      firstFixAt ??= clock();
      const waited = clock() - firstFixAt;
      const allowed = steps.filter(([t]) => waited >= t).at(-1)[1];
      return position.accuracy <= allowed ? position : null;
    },
    /** "Set base here": the next choose() returns this fix whatever its accuracy. */
    force(position) {
      forced = position;
    },
  };
}

/** What the visor says when the base is set. A weak fix shifts the whole route by about that much. */
export function baseMessage(accuracy) {
  const m = Math.round(accuracy ?? 0);
  return accuracy > WEAK_FIX_M ? `Base set here (GPS ±${m} m, weak: route may be off)` : `Base set here (GPS ±${m} m)`;
}
