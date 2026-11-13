import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAlertSounds } from '../js/alert-sounds.js';

function setup({ talking = false } = {}) {
  let t = 0;
  const tones = [];
  const said = [];
  const a = createAlertSounds({ tone: (k) => tones.push(k), speak: (id, o) => said.push([id, o.urgent]), isTalking: () => talking, clock: () => t });
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
  assert.deepEqual(said[0], ['return_solar', true], 'the recorded line with the reason');
  a.update({ ...base, card: { id: 2, name: 'Steep ridge', task: 'Photograph the fracture.' } });
  a.update({ ...base, message: 'Ground Control: Copy, keep to the route' });
  a.update({ ...base, science: { done: 1, total: 5 } });
  assert.deepEqual(tones, ['danger', 'arrive', 'message', 'sample']);
  assert.equal(said.at(-1)[0], 'sample_1');
  assert.ok(said.some(([id]) => id === 'arrive_2') && said.some(([id]) => id === 'gc_message'));
});

test('while talking to the AI only dangers speak; muted means silent', () => {
  const { a, said, tones } = setup({ talking: true });
  a.update(base);
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  a.update({ ...base, alerts: ['SLOPE_AHEAD', 'LOW_O2'] });
  assert.deepEqual(said.map((s) => s[0]), ['low_o2']);
  a.toggle();
  a.update({ ...base, alerts: ['SOLAR_STORM'] });
  assert.equal(tones.length, 2);
});

test('every line the phone can say has a recording, in one voice', async () => {
  const fs = await import('node:fs');
  const { clipTexts } = await import('../tools/make-voice-clips.mjs');
  const { ALL_CLIPS, clipFor } = await import('../js/voice-clips.js');
  const mission = JSON.parse(fs.readFileSync(new URL('../../mission/mission.json', import.meta.url)));
  const made = JSON.parse(fs.readFileSync(new URL('../sounds/clips.json', import.meta.url)));
  const ids = Object.keys(clipTexts(mission));
  for (const id of [...ALL_CLIPS, 'arrive_1', 'arrive_5', 'sample_1', 'sample_5', clipFor('RETURN_TO_BASE', 'Solar storm: radiation rising')]) {
    assert.ok(ids.includes(id), `${id} is in the script`);
    assert.ok(fs.existsSync(new URL(`../sounds/${id}.m4a`, import.meta.url)), `${id}.m4a was recorded`);
  }
  assert.equal(typeof made.voice, 'string');
});
