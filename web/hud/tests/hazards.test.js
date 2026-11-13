import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dangerLevel, firstSteep, NO_GO_DEG } from '../js/core/hazards.js';
import { dangerOptions } from '../js/core/danger-watch.js';
import { roughGrid } from '../js/core/terrain-grid.js';

test('danger levels: no-go over 20°, careful over 12°, rough when a cell sticks out', () => {
  assert.equal(dangerLevel(25, 0), 'nogo');
  assert.equal(dangerLevel(15, 0), 'careful');
  assert.equal(dangerLevel(5, 0.5), 'rough');
  assert.equal(dangerLevel(5, 0.05), null);
});

test('first steep stretch in the path profile (needs 2 m, not one noisy point)', () => {
  const profile = [3, 4, 22, 3, 5, 14, 16, 18, 4].map((deg, d) => ({ d, deg }));
  assert.deepEqual(firstSteep(profile), { startM: 5, lengthM: 3, maxDeg: 18 });
  assert.equal(firstSteep([3, 4, 5].map((deg, d) => ({ d, deg }))), null);
  assert.ok(firstSteep([{ d: 0, deg: 25 }, { d: 1, deg: 26 }]).maxDeg > NO_GO_DEG);
});

test('roughness: a block sticking up stands out from flat ground', () => {
  const heights = new Float32Array(25);
  heights[12] = 1;                                   // the middle of a 5×5 grid
  const r = roughGrid(heights, 5, 5);
  assert.equal(r[12], 1);
  assert.equal(r[6], 0.25);
});

test('which danger views are on, from the link', () => {
  assert.deepEqual(dangerOptions('zones,glow'), { zones: true, signs: false, profile: false, glow: true });
  assert.deepEqual(dangerOptions('all'), { zones: true, signs: true, profile: true, glow: true });
  assert.deepEqual(dangerOptions(null), { zones: false, signs: false, profile: false, glow: false });
});
