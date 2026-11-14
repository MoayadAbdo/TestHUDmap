import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSteepWatch } from '../js/core/steep-watch.js';
import { createDangerSound } from '../js/danger-sound.js';

function watch() {
  let t = 0;
  const w = createSteepWatch({ walkingMps: 0.35, limitDeg: 12, clock: () => t });
  return { w, at: (ms) => { t = ms; } };
}

test('standing still in front of steep ground never warns', () => {
  const { w, at } = watch();
  for (let ms = 0; ms <= 300000; ms += 250) { at(ms); assert.equal(w.update(18, 0.05), false); }
});

test('walking into steep ground warns after a moment, and stops after you stop', () => {
  const { w, at } = watch();
  at(0); assert.equal(w.update(18, 0.8), false);
  at(1000); assert.equal(w.update(18, 0.8), false, 'not yet: one noisy tick is not enough');
  at(1600); assert.equal(w.update(18, 0.8), true);
  at(2000); assert.equal(w.update(18, 0), true, 'a short stop keeps it on (no flicker)');
  at(5100); assert.equal(w.update(18, 0), false);
});

test('a path that flickers steep for a tick does not raise it', () => {
  const { w, at } = watch();
  for (let ms = 0; ms <= 60000; ms += 250) { at(ms); assert.equal(w.update(ms % 1000 === 0 ? 18 : 4, 0.8), false); }
});

test('danger sound: no "slope ahead" while standing; walking says it once per stretch', () => {
  let t = 0;
  const said = [];
  const d = createDangerSound({ beep: () => {}, say: (id) => said.push(id), clock: () => t });
  const steep = { startM: 8, lengthM: 4, maxDeg: 15 };
  for (; t <= 120000; t += 250) d.update({ steep, walking: false });
  assert.deepEqual(said, []);
  for (; t <= 240000; t += 250) d.update({ steep, walking: true });
  assert.deepEqual(said, ['slope_ahead'], 'said once, not every 25 s');
});
