import { bearingDeg, distanceM } from './geo.js';

/**
 * Guides through the stops in order, but any stop not reached yet counts when you get there
 * (you may skip one, or walk the route out of order). Positions are in one frame (desert or Mars), sphere radius r.
 * A stop counts as reached after staying within arrivalM for dwellMs.
 */
export function createNavigator({ stops, base, r, arrivalM = 20, dwellMs = 3000 }) {
  const visited = new Set();
  const insideSince = new Map();
  let next = 0;
  let lastReached = -1;
  let homeward = false;

  /** First stop not reached yet, looking ahead of `from` first, then back. stops.length when all are done. */
  function firstOpen(from) {
    for (let i = from; i < stops.length; i++) if (!visited.has(i)) return i;
    for (let i = 0; i < from; i++) if (!visited.has(i)) return i;
    return stops.length;
  }

  function target() {
    return homeward || next >= stops.length ? { ...base, isBase: true } : stops[next];
  }

  function checkArrival(position, nowMs) {
    if (homeward) return null;                       // returning on low oxygen: no stop cards on the way
    for (let i = 0; i < stops.length; i++) {
      if (visited.has(i)) continue;
      if (distanceM(position, stops[i].at, r) > arrivalM) { insideSince.delete(i); continue; }
      if (!insideSince.has(i)) insideSince.set(i, nowMs);
      if (nowMs - insideSince.get(i) >= dwellMs) {
        visited.add(i);
        insideSince.delete(i);
        lastReached = i;
        next = firstOpen(i + 1);
        return stops[i];
      }
    }
    return null;
  }

  return {
    goHome() {
      homeward = true;
      insideSince.clear();
    },
    get nextIndex() {
      return next;
    },
    /** Index of the stop reached most recently, -1 before the first. */
    get lastReachedIndex() {
      return lastReached;
    },
    isVisited: (i) => visited.has(i),
    update(position, nowMs) {
      const arrived = checkArrival(position, nowMs);
      const now = target();
      return {
        target: now,
        distanceM: distanceM(position, now.at, r),
        bearingDeg: bearingDeg(position, now.at),
        baseDistanceM: distanceM(position, base.at, r),
        arrived,
        done: visited.size >= stops.length,
      };
    },
  };
}

/** Arrow angle on screen: where to turn, degrees clockwise from straight ahead. */
export const arrowAngle = (bearing, heading) => ((bearing - heading + 540) % 360) - 180;

export const etaMinutes = (distance, walkSpeedMps) => distance / walkSpeedMps / 60;
