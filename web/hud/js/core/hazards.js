import { bearingDeg, distanceM, wrap180 } from './geo.js';
import { pointAlong } from './path.js';

/**
 * Dangers from the real 1 m height map: steep ground (12° careful, 20° no-go: NASA's EVA limit) and rough ground
 * (cells that stick out of their neighbours: ridge walls, blocks). Four ways to show them, each optional:
 * zones painted on the ground, warning signs in the world, a profile of the path ahead, and edge glow + sound.
 */
export const CAREFUL_DEG = 12;
export const NO_GO_DEG = 20;
export const ROUGH_M = 0.2;              // the bumpiest ~3% of the map

export function dangerLevel(slopeDeg, roughM) {
  if (slopeDeg > NO_GO_DEG) return 'nogo';
  if (slopeDeg > CAREFUL_DEG) return 'careful';
  if (roughM > ROUGH_M) return 'rough';
  return null;
}

const ZONE_RGBA = { nogo: [255, 64, 64, 150], careful: [255, 190, 60, 95], rough: [255, 236, 170, 120] };

/** RGBA pixels (one per grid cell, row 0 = north) for painting danger zones on the ground; safe cells stay clear. */
export function zonePixels(grid) {
  const px = new Uint8ClampedArray(grid.gw * grid.gh * 4);
  for (let k = 0; k < grid.gw * grid.gh; k++) {
    let level = dangerLevel(grid.slope[k], grid.rough[k]);
    const x = k % grid.gw;
    const y = Math.floor(k / grid.gw);
    if (level === 'rough' && (x + y) % 3) level = null;          // rough ground as hatching, not a solid patch
    if (level) px.set(ZONE_RGBA[level], k * 4);
  }
  return px;
}

/** Slope every stepM metres along the next aheadM of the path: [{ d, deg }]. */
export function profileAhead(path, r, slopeAt, { aheadM = 60, stepM = 1 } = {}) {
  const out = [];
  for (let d = 0; d <= aheadM; d += stepM) out.push({ d, deg: slopeAt(pointAlong(path, d, r)) ?? 0 });
  return out;
}

/** The first steep stretch in a profile: { startM, lengthM, maxDeg }, or null. Needs 2 m of it, not one noisy cell. */
export function firstSteep(profile, deg = CAREFUL_DEG) {
  let start = null;
  for (let i = 0; i < profile.length; i++) {
    const steep = profile[i].deg > deg;
    if (steep && start == null) start = i;
    if ((!steep || i === profile.length - 1) && start != null) {
      const end = steep ? i : i - 1;
      if (end - start >= 1) {
        const run = profile.slice(start, end + 1);
        return { startM: profile[start].d, lengthM: profile[end].d - profile[start].d + 1, maxDeg: Math.max(...run.map((p) => p.deg)) };
      }
      start = null;
    }
  }
  return null;
}

/**
 * The nearest few dangers around the walker (within rangeM, within ±coneDeg of where they look), at least
 * gapM apart, so the world shows 1-3 calm signs instead of a red carpet.
 * Returns [{ at, distM, deg, kind: 'slope' | 'rough' }] in the walk's frame.
 */
export function dangersAround({ grid, toMars, toFrame, from, heading, r, rangeM = 60, coneDeg = 60, gapM = 15, max = 3 }) {
  const center = grid.cellOf(toMars(from));
  if (center == null) return [];
  const reach = Math.ceil(rangeM / Math.min(grid.cellX, grid.cellY));
  const cx = center % grid.gw;
  const cy = Math.floor(center / grid.gw);
  const found = [];
  for (let y = Math.max(0, cy - reach); y <= Math.min(grid.gh - 1, cy + reach); y += 2) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(grid.gw - 1, cx + reach); x += 2) {
      const k = y * grid.gw + x;
      const level = dangerLevel(grid.slope[k], grid.rough[k]);
      if (level !== 'nogo' && level !== 'rough') continue;
      const at = toFrame(grid.latLonOf(k));
      const distM = distanceM(from, at, r);
      if (distM > rangeM || distM < 4) continue;
      if (Math.abs(wrap180(bearingDeg(from, at) - heading)) > coneDeg) continue;
      found.push({ at, distM, deg: grid.slope[k], kind: level === 'nogo' ? 'slope' : 'rough' });
    }
  }
  found.sort((a, b) => a.distM - b.distM);
  const picked = [];
  for (const f of found) {
    if (picked.length >= max) break;
    if (picked.every((p) => distanceM(p.at, f.at, r) >= gapM)) picked.push(f);
  }
  return picked;
}

/** Closest no-go ground within rangeM (any direction): { distM, bearingDeg } or null. For edge glow and beeps. */
export function nearestNoGo({ grid, toMars, toFrame, from, r, rangeM = 15 }) {
  const center = grid.cellOf(toMars(from));
  if (center == null) return null;
  const reach = Math.ceil(rangeM / Math.min(grid.cellX, grid.cellY));
  const cx = center % grid.gw;
  const cy = Math.floor(center / grid.gw);
  let best = null;
  for (let y = Math.max(0, cy - reach); y <= Math.min(grid.gh - 1, cy + reach); y++) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(grid.gw - 1, cx + reach); x++) {
      const k = y * grid.gw + x;
      if (grid.slope[k] <= NO_GO_DEG) continue;
      const at = toFrame(grid.latLonOf(k));
      const distM = distanceM(from, at, r);
      if (distM <= rangeM && (!best || distM < best.distM)) best = { distM, bearingDeg: bearingDeg(from, at) };
    }
  }
  return best;
}
