import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EARTH_RADIUS_M, fromOffset } from '../js/core/geo.js';
import { createNavigator } from '../js/core/nav.js';
import { CARD_MAX_MS, CARD_MIN_MS, createStopCard, nearbyReachedStop } from '../js/core/stop-card.js';

const BASE = [0, 0];
const at = (east, north) => fromOffset(BASE, { east, north }, EARTH_RADIUS_M);
const stops = [
  { id: 1, name: 'One', at: at(0, 100) },
  { id: 2, name: 'Two', at: at(0, 200) },
  { id: 3, name: 'Exit', at: at(0, 300) },
];
const nav = () => createNavigator({ stops, base: { at: BASE }, r: EARTH_RADIUS_M });

test('passing a later stop by chance never skips the earlier ones', () => {
  const n = nav();
  n.update(at(0, 200), 0);
  const step = n.update(at(0, 200), 3000);
  assert.equal(step.arrived.name, 'Two');
  assert.equal(step.target.name, 'One');
});

test('skipping a stop: the Exit still counts, then it guides back to the one you missed', () => {
  const n = nav();
  n.update(at(0, 300), 0);
  const step = n.update(at(0, 300), 3000);
  assert.equal(step.arrived.name, 'Exit');
  assert.equal(step.target.name, 'One', 'missed stop is next');
  assert.ok(!step.done);
  assert.equal(n.lastReachedIndex, 2);
  assert.ok(n.isVisited(2) && !n.isVisited(0));
});

test('all stops reached in any order: done, back to base', () => {
  const n = nav();
  for (const [i, p] of [[0, at(0, 200)], [1, at(0, 100)], [2, at(0, 300)]]) {
    n.update(p, i * 10_000);
    n.update(p, i * 10_000 + 3000);
  }
  const step = n.update(at(0, 300), 40_000);
  assert.ok(step.done && step.target.isBase);
});

test('no stop cards on the way home', () => {
  const n = nav();
  n.goHome();
  n.update(at(0, 100), 0);
  assert.equal(n.update(at(0, 100), 3000).arrived, null);
});

test('stop card stays while you are there, closes when you walk away', () => {
  const card = createStopCard();
  card.show(stops[0], 0);
  card.update(at(0, 100), 60_000, EARTH_RADIUS_M);
  assert.equal(card.stop?.name, 'One', 'still standing at the stop after 60 s');
  card.update(at(0, 140), 61_000, EARTH_RADIUS_M);
  assert.equal(card.stop?.name, 'One', 'one GPS jump away is not leaving');
  card.update(at(0, 100), 62_000, EARTH_RADIUS_M);
  card.update(at(0, 140), 63_000, EARTH_RADIUS_M);
  card.update(at(0, 140), 66_500, EARTH_RADIUS_M);
  assert.equal(card.stop, null, '40 m away for 3.5 s: closed');
});

test('stop card: no flicker in the first seconds, never stuck open', () => {
  const card = createStopCard();
  card.show(stops[0], 0);
  card.update(at(0, 140), CARD_MIN_MS - 1, EARTH_RADIUS_M);
  assert.equal(card.stop?.name, 'One');
  card.update(at(0, 100), CARD_MAX_MS + 1, EARTH_RADIUS_M);
  assert.equal(card.stop, null);
});

test('reopen: the reached stop you are standing at', () => {
  const visited = (i) => i === 1;
  assert.equal(nearbyReachedStop(stops, visited, at(0, 205), EARTH_RADIUS_M)?.name, 'Two');
  assert.equal(nearbyReachedStop(stops, visited, at(0, 100), EARTH_RADIUS_M), null, 'stop One not reached yet');
});
