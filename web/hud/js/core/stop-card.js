import { distanceM } from './geo.js';

/** The stop card stays while you are at the stop and closes when you walk away (or when asked to). */
export const CARD_MIN_MS = 5000;        // at least this long, so it doesn't flicker at the edge of the circle
export const CARD_LEAVE_M = 30;         // the stop circle is 20 m; close a bit beyond it
export const CARD_MAX_MS = 180000;      // never stuck open
export const AWAY_MS = 3000;            // away this long in a row (one GPS jump is not leaving)

export function createStopCard() {
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
      const left = away && t - card.awaySince >= AWAY_MS && t - card.shownAt > CARD_MIN_MS;
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
