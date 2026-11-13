import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAlertSounds } from '../js/alert-sounds.js';

function setup({ talking = false } = {}) {
  let t = 0;
  const tones = [];
  const said = [];
  const a = createAlertSounds({ tone: (k) => tones.push(k), speak: (x, o) => said.push([x, o.urgent]), isTalking: () => talking, clock: () => t });
  return { a, tones, said, at: (ms) => { t = ms; } };
}
const base = { alerts: [], card: null, message: null, science: { done: 0, total: 5 } };

test('new alerts get a tone and a spoken line, once; repeats wait 30 s', () => {
  const { a, tones, said, at } = setup();
  a.update(base);
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  assert.deepEqual(tones, ['warn']);
  assert.equal(said.length, 1);
  a.update(base); at(5000); a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  assert.equal(said.length, 1, 'flickering on again within 30 s: tone only');
  assert.deepEqual(tones, ['warn', 'warn']);
});

test('return to base is urgent and says why; arrival, samples and Ground Control messages are heard', () => {
  const { a, tones, said } = setup();
  a.update(base);
  a.update({ ...base, alerts: ['RETURN_TO_BASE'], returnReason: 'Solar storm: radiation rising' });
  assert.deepEqual(said[0], ['Return to base. Solar storm: radiation rising', true]);
  a.update({ ...base, card: { id: 2, name: 'Steep ridge', task: 'Photograph the fracture.' } });
  a.update({ ...base, message: 'Ground Control: Copy, keep to the route' });
  a.update({ ...base, science: { done: 1, total: 5 } });
  assert.deepEqual(tones, ['danger', 'arrive', 'message', 'sample']);
  assert.match(said.at(-1)[0], /Sample logged. 1 of 5/);
});

test('while talking to the AI only dangers speak; muted means silent', () => {
  const { a, said, tones } = setup({ talking: true });
  a.update(base);
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  a.update({ ...base, alerts: ['SLOPE_AHEAD', 'LOW_O2'] });
  assert.deepEqual(said.map((s) => s[0]), ['Oxygen low.']);
  a.toggle();
  a.update({ ...base, alerts: ['SOLAR_STORM'] });
  assert.equal(tones.length, 2);
});
