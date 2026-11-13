/**
 * When to show every suit panel: not on head moves, but when it's useful. Walking: only what you need to walk.
 * Standing still for a few seconds (at a stop, looking around, resting): the full suit display fades in.
 * Start walking again and it fades out. "full" pins it on (I key / Ground Control); "auto" is the default.
 */
export const STILL_MS = 3000;          // stand still this long before the panels come in
const FADE_MS = 450;

export function createDetailAuto({ stillMs = STILL_MS, moveMps = 0.35 } = {}) {
  let mode = 'auto';
  let stillSince = null;
  let level = 0;
  let lastT = null;
  return {
    /** speedMps: walking speed now; busy: a stop card or a "waiting" screen is up (no panels on top of it). */
    update(t, { speedMps = 0, busy = false } = {}) {
      const dt = lastT == null ? 0 : t - lastT;
      lastT = t;
      if (speedMps > moveMps) stillSince = null;
      else stillSince ??= t;
      const want = mode === 'full' || (!busy && stillSince != null && t - stillSince >= stillMs) ? 1 : 0;
      const step = dt / FADE_MS;
      if (want > level) level = Math.min(1, level + step);
      else if (want < level) level = Math.max(0, level - step);
      return level;
    },
    /** I key / Ground Control: pin every panel on, or back to automatic. */
    toggle() {
      mode = mode === 'full' ? 'auto' : 'full';
      return mode;
    },
    reset() {
      mode = 'auto';
    },
    get mode() {
      return mode;
    },
    get level() {
      return level;
    },
  };
}
