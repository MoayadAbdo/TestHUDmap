import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rockiness, rockSpots } from '../../sim/rock-spots.js';

const flat = (gw, gh) => new Float32Array(gw * gh);
const box = (heights, gw, gh) => ({ heights, gw, gh, W: (gw - 1) * 2.5, H: (gh - 1) * 2.5, bx: 0, bz: 0 });
const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();

test('smooth flat ground gets no rocks; broken or steep ground does', () => {
  assert.equal(rockiness(0.02, 5), 0);
  assert.ok(rockiness(0.3, 5) === 1);
  assert.ok(rockiness(0.02, 35) > 0.5);
});

test('rocks sit only on the bumpy cells of the height map, off the walking lane', () => {
  const gw = 21, gh = 21, h = flat(gw, gh);
  h[10 * gw + 5] = 1;                                        // one block sticking out, west of the middle
  const t = box(h, gw, gh);
  const spots = rockSpots(t, { route: [{ x: 10, z: 0 }], rand });
  assert.ok(spots.length > 0);
  const blockX = (5 / (gw - 1)) * t.W - t.W / 2;
  for (const p of spots) assert.ok(Math.abs(p.x - blockX) < 4 && Math.abs(p.z) < 4, `rock at ${p.x},${p.z}`);
  assert.equal(rockSpots(box(flat(gw, gh), gw, gh), { route: [{ x: 0, z: 0 }], rand }).length, 0);
});

test('photo boulders keep their real spot and size, except in the walking lane', async () => {
  const { boulderSpots } = await import('../../sim/rock-spots.js');
  const toLocal = (lat, lon) => ({ x: lon, z: -lat });
  const spots = boulderSpots([[0, 10, 2], [0, 0.5, 1]], toLocal, { route: [{ x: 0, z: 0 }] });
  assert.deepEqual(spots, [{ x: 10, z: -0, size: 1, shape: 0 }]);
});
