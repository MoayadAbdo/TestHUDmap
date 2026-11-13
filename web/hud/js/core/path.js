import { distanceM, fromOffset, offsetM } from './geo.js';

/**
 * Walking path to the target. Today: along Curiosity's own drive route (ground the rover proved passable),
 * rejoining it from wherever you are. A planner that avoids steep cells on a real slope map can replace
 * this one later: anything with plan(from, target) → [[lat, lon], ...] works.
 */
export function createRoutePlanner({ route, r }) {
  const origin = route[0]?.at ?? [0, 0];
  const pts = route.map((p) => ({ ...offsetM(origin, p.at, r), slope: p.slope_deg ?? 0 }));
  const toLatLon = (p) => fromOffset(origin, p, r);

  /** Closest point on the route polyline: segment index and the point itself (east/north metres). */
  function closest(p) {
    let best = { i: 0, point: pts[0], d: Infinity };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.east - a.east;
      const dy = b.north - a.north;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.east - a.east) * dx + (p.north - a.north) * dy) / len2));
      const point = { east: a.east + t * dx, north: a.north + t * dy };
      const d = Math.hypot(p.east - point.east, p.north - point.north);
      if (d < best.d) best = { i, point, d };
    }
    return best;
  }

  return {
    /** Slope (degrees) of the route next to this point, to paint steep parts of the path. */
    slopeAt(at) {
      return pts[closest(offsetM(origin, at, r)).i]?.slope ?? 0;
    },
    plan(from, target) {
      if (pts.length < 2) return [from, target];
      const start = closest(offsetM(origin, from, r));
      const end = closest(offsetM(origin, target, r));
      const path = [from, toLatLon(start.point)];
      if (end.i > start.i) for (let i = start.i + 1; i <= end.i; i++) path.push(toLatLon(pts[i]));
      else if (end.i < start.i) for (let i = start.i; i > end.i; i--) path.push(toLatLon(pts[i]));
      path.push(toLatLon(end.point), target);
      return path;
    },
  };
}

export function pathLength(path, r) {
  let m = 0;
  for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1], path[i], r);
  return m;
}

/** The point `aheadM` metres along the path (the end if the path is shorter). */
export function pointAlong(path, aheadM, r) {
  let left = aheadM;
  for (let i = 1; i < path.length; i++) {
    const step = distanceM(path[i - 1], path[i], r);
    if (step >= left && step > 0) {
      const t = left / step;
      return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])];
    }
    left -= step;
  }
  return path[path.length - 1];
}

/** Points every `stepM` metres along the path from startM to endM (for ground arrows). */
export function samplePath(path, { startM, endM, stepM }, r) {
  const out = [];
  for (let d = startM; d <= endM; d += stepM) out.push({ d, at: pointAlong(path, d, r) });
  return out;
}

/**
 * What the visor needs from a path: its length, a point aheadM along it (where to head now),
 * and points every 0.5 m over the first endM metres (for the ground arrows).
 */
export function pathGuide(path, r, { aheadM = 10, endM = 32 } = {}) {
  const lengthM = pathLength(path, r);
  return {
    lengthM,
    toward: pointAlong(path, Math.min(aheadM, lengthM), r),
    samples: samplePath(path, { startM: 0, endM: Math.min(endM, lengthM), stepM: 0.5 }, r),
  };
}
