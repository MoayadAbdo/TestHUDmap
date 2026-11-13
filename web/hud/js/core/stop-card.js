import { distanceM } from './geo.js';

/** The stop card is a short notice: it closes by itself after 10 s, or when you leave the stop's circle; tap / C / Y closes it. */
export const CARD_MIN_MS = 1500;        // no flicker right at the edge of the circle
export const CARD_LEAVE_M = 22;         // the stop circle is 20 m, plus a little margin
export const CARD_MAX_MS = 10000;       // not sticky: gone after 10 s (C shows it again)
export const AWAY_MS = 2000;            // field mode: out of the circle this long (one GPS jump is not leaving)

/** awayMs: how long outside the circle counts as leaving (0 in the 3D sim, where the position doesn't jitter). */
export function createStopCard({ awayMs = AWAY_MS } = {}) {
  let card = null;
  return {
    show(stop, t) {
      card = { stop, shownAt: t, awaySince: null };
    },
    close() {
      card = null;
    },
    /** Call every tick with the walker's position (same frame and sphere radius r as the stops). */
    update(position, t, r) {
      if (!card) return;
      const away = distanceM(position, card.stop.at, r) > CARD_LEAVE_M;
      card.awaySince = away ? card.awaySince ?? t : null;
      const left = away && t - card.awaySince >= awayMs && t - card.shownAt > CARD_MIN_MS;
      if (left || t - card.shownAt > CARD_MAX_MS) card = null;
    },
    get stop() {
      return card?.stop ?? null;
    },
  };
}

/** The reached stop you are standing at (within CARD_LEAVE_M), to show its card again. */
export function nearbyReachedStop(stops, isVisited, position, r) {
  let best = null;
  let bestM = CARD_LEAVE_M;
  stops.forEach((s, i) => {
    const m = distanceM(position, s.at, r);
    if (isVisited(i) && m <= bestM) { best = s; bestM = m; }
  });
  return best;
}
