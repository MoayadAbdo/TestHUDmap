import { relativeTo } from './ar.js';
import { wrap180 } from './geo.js';
import { dangersAround, firstSteep, nearestNoGo, profileAhead } from './hazards.js';

const EVERY_MS = 500;    // look around twice a second (cheap, and dangers don't move)

/**
 * Keeps the dangers around the walker up to date for the visor: signs in the world, the path profile ahead,
 * and the closest no-go ground (for the edge glow and the beeps). show = which of these are on.
 */
export function createDangerWatch({ grid, toMars, toFrame, r, show }) {
  let last = -Infinity;
  let state = { signs: [], profile: [], steep: null, near: null };
  return {
    update({ position, heading, path, t, slopeAt }) {
      if (t - last < EVERY_MS) return state;
      last = t;
      const from = position.at;
      state = {
        signs: show.signs ? dangersAround({ grid, toMars, toFrame, from, heading, r }) : [],
        profile: show.profile && path ? profileAhead(path, r, slopeAt) : [],
        steep: null,
        near: show.glow ? nearestNoGo({ grid, toMars, toFrame, from, r }) : null,
      };
      if (state.profile.length) state.steep = firstSteep(state.profile);
      return state;
    },
    /** What the visor draws: signs as forward / right metres, the near danger as an angle from where you look. */
    view(position, heading, eyeAt) {
      return {
        signs: state.signs.map((s) => ({ ...s, ...relativeTo(position.at, heading, s.at, r), eye: eyeAt(s.at) })),
        profile: state.profile,
        steep: state.steep,
        near: state.near ? { distM: state.near.distM, relDeg: wrap180(state.near.bearingDeg - heading) } : null,
      };
    },
  };
}

/** Which danger views are on, from ?dangers=zones,signs,profile,glow (or all). */
export function dangerOptions(param) {
  const want = new Set(String(param ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const all = want.has('all');
  return { zones: all || want.has('zones'), signs: all || want.has('signs'), profile: all || want.has('profile'), glow: all || want.has('glow') };
}
