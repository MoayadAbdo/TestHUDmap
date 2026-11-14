import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARS_RADIUS_M as R, distanceM } from '../js/core/geo.js';
import { BLOCKED_DEG, createSafePlanner, findCells, slopeCost, slopeGrid } from '../js/core/safe-path.js';

const flat = (gw, gh) => new Float32Array(gw * gh);

test('slope from heights: a 1 m rise over a 1 m cell is 45°', () => {
  const gw = 3, gh = 3, heights = flat(gw, gh);
  for (let j = 0; j < gh; j++) heights[j * gw + 2] = 2;   // rises 2 m over 2 cells to the east
  const s = slopeGrid({ heights, gw, gh, cellX: 1, cellY: 1 });
  assert.ok(Math.abs(s[gw + 1] - 45) < 1e-6);
});

test('slope cost: gentle is cheap, very steep is blocked', () => {
  assert.equal(slopeCost(5), 1);
  assert.ok(slopeCost(15) > 4);
  assert.equal(slopeCost(BLOCKED_DEG + 1), Infinity);
});

test('A* goes around a steep wall through the gap, not straight through', () => {
  const gw = 21, gh = 21;
  const slope = flat(gw, gh);
  for (let j = 0; j < gh; j++) if (j !== 18) slope[j * gw + 10] = 40;   // a wall down the middle, gap near the bottom
  const cells = findCells({ slope, gw, gh, cellX: 1, cellY: 1 }, 10 * gw + 2, 10 * gw + 18);
  assert.ok(cells, 'found a way');
  assert.ok(cells.includes(18 * gw + 10), 'through the gap');
  assert.ok(!cells.some((k) => slope[k] > BLOCKED_DEG));
});

test('A* returns null when every way is blocked', () => {
  const gw = 5, gh = 5, slope = flat(gw, gh);
  for (let j = 0; j < gh; j++) slope[j * gw + 2] = 40;
  assert.equal(findCells({ slope, gw, gh, cellX: 1, cellY: 1 }, 0, 4), null);
});

test('planner: steep wall on the straight line → longer, safer path; falls back outside the map', () => {
  const gw = 41, gh = 41, heights = flat(gw, gh);
  // a 10 m high ridge across the middle (rows 18–22), except a ramp at the east end
  for (let j = 18; j <= 22; j++) for (let i = 0; i < 36; i++) heights[j * gw + i] = j === 20 ? 10 : 5;
  const terrain = { heights, grid: [gw, gh], bounds: { north: 0.001, south: 0, west: 0, east: 0.001 }, width_m: 59.3, height_m: 59.3 };
  const fallback = { plan: (a, b) => ['fallback', a, b], slopeAt: () => 0 };
  const id = (p) => p;
  const planner = createSafePlanner({ terrain, toMars: id, toFrame: id, r: R, fallback });
  const from = [0.0009, 0.0002], to = [0.0001, 0.0002];
  const path = planner.plan(from, to);
  assert.notEqual(path[0], 'fallback');
  let length = 0;
  for (let i = 1; i < path.length; i++) length += distanceM(path[i - 1], path[i], R);
  assert.ok(length > distanceM(from, to, R) * 1.3, `goes around: ${length.toFixed(1)} m vs ${distanceM(from, to, R).toFixed(1)} m`);
  assert.equal(planner.plan([1, 1], to)[0], 'fallback', 'outside the map');
});

test('one no-go number: the safe path blocks exactly where the visor says NO-GO', async () => {
  const { NO_GO_DEG } = await import('../js/core/hazards.js');
  const { LIMITS } = await import('../js/core/alerts.js');
  assert.equal(BLOCKED_DEG, NO_GO_DEG);
  assert.equal(LIMITS.slopeNoGoDeg, NO_GO_DEG);
  assert.equal(slopeCost(NO_GO_DEG + 0.1), Infinity);
});
