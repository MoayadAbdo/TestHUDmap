import { roughGrid, slopeGrid } from "../hud/js/core/terrain-grid.js";

/**
 * Where the rocks go. Boulders (~1 m and up) stand exactly where the HiRISE photo shows them (builder/boulders.py).
 * Smaller stones can't be seen from orbit, so they go where the real height map is broken (cells that stick out of
 * their neighbours: ridge walls, blocks) or steep, where loose rock collects; smooth flat ground stays bare.
 * The data says where and how many; rand only jitters each stone inside its ~2.5 m cell and picks its turn.
 * t = { heights, gw, gh, W, H, bx, bz } as in the sim. Returns [{ x, z, size (radius, m), shape }] nearest the route first.
 */
const ROUGH_FROM = 0.06, ROUGH_FULL = 0.3;       // m: the bumpiest quarter of the map → the bumpiest 1%
const SLOPE_FROM = 15, SLOPE_FULL = 35;          // degrees: loose rock on steep sides
const PER_CELL = 3;                              // rocks in a fully broken cell

const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));

export function rockiness(roughM, slopeDeg) {
  return Math.min(1, ramp(roughM, ROUGH_FROM, ROUGH_FULL) + 0.6 * ramp(slopeDeg, SLOPE_FROM, SLOPE_FULL));
}

export function rockSpots(t, { route, rand, rangeM = 160, laneM = 2.2, max = 2400, maxSizeM = 0.45 }) {
  const { heights, gw, gh, W, H, bx, bz } = t;
  const cellX = W / (gw - 1), cellY = H / (gh - 1);
  const rough = roughGrid(heights, gw, gh);
  const slope = slopeGrid({ heights, gw, gh, cellX, cellY });
  const xOf = (i) => (i / (gw - 1)) * W - W / 2 - bx;
  const zOf = (j) => (j / (gh - 1)) * H - H / 2 - bz;
  const toRoute = (x, z) => route.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
  const spots = [];
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const k = j * gw + i;
      const w = rockiness(rough[k], slope[k]);
      if (w <= 0) continue;
      const cx = xOf(i), cz = zOf(j);
      const d = toRoute(cx, cz);
      if (d > rangeM) continue;
      const n = Math.floor(w * PER_CELL + rand());              // 0.4 → 1 rock, sometimes 2
      for (let r = 0; r < n; r++) {
        const x = cx + (rand() - 0.5) * cellX, z = cz + (rand() - 0.5) * cellY;
        if (toRoute(x, z) < laneM) continue;                      // keep the walking lane clear
        const size = Math.min(maxSizeM, 0.06 + w * (0.12 + rand() * 0.3));   // rougher cell, bigger stones; big ones come from the photo
        spots.push({ x, z, size, shape: w > 0.7 ? 2 : Math.floor(rand() * 2), d });
      }
    }
  }
  return spots.sort((a, b) => a.d - b.d).slice(0, max);
}

/** The boulders seen in the photo ([[lat, lon, size_m]]), in the sim's metres; ones in the walking lane are left out. */
export function boulderSpots(boulders, toLocal, { route, laneM = 1.5 }) {
  const out = [];
  for (const [lat, lon, size] of boulders ?? []) {
    const { x, z } = toLocal(lat, lon);
    if (route.some((p) => Math.hypot(p.x - x, p.z - z) < laneM + size / 2)) continue;
    out.push({ x, z, size: size / 2, shape: size > 2 ? 2 : 0 });   // size = the rock's radius in the sim
  }
  return out;
}
