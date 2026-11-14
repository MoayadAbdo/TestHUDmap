import { distanceM } from './geo.js';
import { NO_GO_DEG } from './hazards.js';
import { createTerrainGrid, slopeGrid } from './terrain-grid.js';

export { slopeGrid };

/**
 * Safest walking path on the real height map (HiRISE 1 m DEM, resampled to the terrain grid):
 * A* over the grid, where steep cells cost more and very steep ones can't be walked.
 * Same shape as the route planner: plan(from, target) → [[lat, lon], ...] in the walk's frame.
 */
export const BLOCKED_DEG = NO_GO_DEG;   // the same number as the NO-GO alert: the path never leads onto ground the visor calls NO-GO
const EASY_DEG = 6;                  // gentle slopes cost (almost) nothing extra
const REPLAN_MS = 4000;
const OFF_PATH_M = 6;                // walked this far off the planned path: plan again


/** How much harder a cell is to cross than flat ground (Infinity = blocked). */
export const slopeCost = (deg) => (deg > BLOCKED_DEG ? Infinity : 1 + Math.max(0, deg - EASY_DEG) ** 2 / 20);

/** Small binary heap keyed by f. */
function heap() {
  const items = [];
  return {
    get size() { return items.length; },
    push(item) {
      items.push(item);
      let i = items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (items[p].f <= items[i].f) break;
        [items[p], items[i]] = [items[i], items[p]];
        i = p;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < items.length && items[l].f < items[m].f) m = l;
          if (r < items.length && items[r].f < items[m].f) m = r;
          if (m === i) break;
          [items[m], items[i]] = [items[i], items[m]];
          i = m;
        }
      }
      return top;
    },
  };
}

/** A* from cell a to cell b; returns cell indexes, or null if every way is blocked. */
export function findCells({ slope, gw, gh, cellX, cellY }, a, b) {
  const cost = new Float32Array(gw * gh).fill(Infinity);
  const from = new Int32Array(gw * gh).fill(-1);
  const done = new Uint8Array(gw * gh);
  const [bx, by] = [b % gw, Math.floor(b / gw)];
  const guess = (k) => Math.hypot(((k % gw) - bx) * cellX, (Math.floor(k / gw) - by) * cellY);
  const open = heap();
  cost[a] = 0;
  open.push({ k: a, f: guess(a) });
  const steps = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (dx || dy) steps.push([dx, dy, Math.hypot(dx * cellX, dy * cellY)]);
  while (open.size) {
    const { k } = open.pop();
    if (done[k]) continue;
    if (k === b) break;
    done[k] = 1;
    const x = k % gw;
    const y = Math.floor(k / gw);
    for (const [dx, dy, len] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const n = ny * gw + nx;
      if (done[n]) continue;
      const step = len * (slopeCost(slope[n]) + slopeCost(slope[k])) / 2;
      if (!Number.isFinite(step)) continue;
      const c = cost[k] + step;
      if (c < cost[n]) { cost[n] = c; from[n] = k; open.push({ k: n, f: c + guess(n) }); }
    }
  }
  if (from[b] === -1 && a !== b) return null;
  const cells = [b];
  while (cells[cells.length - 1] !== a) cells.push(from[cells[cells.length - 1]]);
  return cells.reverse();
}

/**
 * The planner. terrain = { heights, grid: [gw, gh], bounds: { north, south, west, east }, width_m, height_m }
 * (mission/terrain). toMars / toFrame convert between the walk's frame (desert or Mars) and Mars lat/lon.
 * fallback (the route planner) is used outside the map or when every way is blocked.
 */
export function createSafePlanner({ terrain, grid: given = null, toMars, toFrame, r, fallback, clock = () => performance.now() }) {
  const grid = given ?? createTerrainGrid(terrain);
  const { cellOf, latLonOf } = grid;

  let cached = null;      // { key, path, at }

  function planFresh(from, target) {
    const a = cellOf(toMars(from));
    const b = cellOf(toMars(target));
    if (a == null || b == null) return null;
    const cells = findCells(grid, a, b);
    if (!cells) return null;
    const path = [from];
    for (let i = 3; i < cells.length - 1; i += 3) path.push(toFrame(latLonOf(cells[i])));   // every ~7 m
    path.push(target);
    return path;
  }

  /** The cached path from the walker's nearest point on it, or null if they wandered off. */
  function follow(from, path) {
    let best = 0;
    let bestM = Infinity;
    path.forEach((p, i) => { const m = distanceM(from, p, r); if (m < bestM) { bestM = m; best = i; } });
    return bestM > OFF_PATH_M ? null : [from, ...path.slice(best + 1)];
  }

  return {
    slopeAt(at) {
      const k = cellOf(toMars(at));
      return k == null ? fallback.slopeAt(at) : grid.slope[k];
    },
    plan(from, target) {
      const key = target.join(',');
      const t = clock();
      if (cached && cached.key === key && t - cached.at < REPLAN_MS) {
        const kept = follow(from, cached.path);
        if (kept) return kept;
      }
      const path = planFresh(from, target) ?? fallback.plan(from, target);
      cached = { key, path, at: t };
      return path;
    },
  };
}
