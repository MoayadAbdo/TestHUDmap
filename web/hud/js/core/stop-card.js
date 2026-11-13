import { distanceM } from './geo.js';

/** The stop card stays while you are at the stop and closes when you walk away (or when asked to). */
export const CARD_MIN_MS = 5000;        // at least this long, so it doesn't flicker at the edge of the circle
export const CARD_LEAVE_M = 30;         // the stop circle is 20 m; close a bit beyond it
export const CARD_MAX_MS = 180000;      // never stuck open

export function createStopCard() {
  let card = null;
  return {
    show(stop, t) {
      card = { stop, shownAt: t };
    },
    close() {
      card = null;
    },
    /** Call every tick with the walker's position (same frame and sphere radius r as the stops). */
    update(position, t, r) {
      if (!card) return;
      const away = distanceM(position, card.stop.at, r) > CARD_LEAVE_M;
      if ((away && t - card.shownAt > CARD_MIN_MS) || t - card.shownAt > CARD_MAX_MS) card = null;
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
