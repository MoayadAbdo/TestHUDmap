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

test('every alert that starts is spoken once; only a flicker within 10 s stays quiet', () => {
  const { a, tones, said, at } = setup();
  a.update(base);
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  assert.deepEqual(tones, ['warn']);
  assert.equal(said.length, 1);
  a.update(base); at(5000); a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  assert.equal(said.length, 1, 'flickering on again within 10 s: tone only');
  assert.deepEqual(tones, ['warn', 'warn']);
  a.update(base); at(16000); a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  assert.equal(said.length, 2, 'a new steep stretch later is spoken again');
});

test('several alerts at once: all spoken, most important first, none cuts the others', () => {
  const { a, said } = setup();
  a.update(base);
  a.update({ ...base, alerts: ['SLOPE_NO_GO', 'RETURN_TO_BASE', 'SOLAR_STORM'], returnReason: 'Solar storm: radiation rising' });
  assert.deepEqual(said, [['slope_nogo', true], ['return_solar', false]], 'the return line names the storm, so "solar" is not said twice');
});

test('a new emergency while already heading home is still spoken', () => {
  const { a, said } = setup();
  a.update(base);
  a.update({ ...base, alerts: ['RETURN_TO_BASE'], returnReason: 'Oxygen reserve reached' });
  a.update({ ...base, alerts: ['RETURN_TO_BASE', 'SOLAR_STORM'], returnReason: 'Oxygen reserve reached' });
  assert.deepEqual(said.map((x) => x[0]), ['return_reserve', 'solar']);
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

test('while talking to the AI every alert still speaks (arrivals wait); muted means silent', () => {
  const { a, said, tones } = setup({ talking: true });
  a.update(base);
  a.update({ ...base, alerts: ['SLOPE_AHEAD'] });
  a.update({ ...base, alerts: ['SLOPE_AHEAD', 'LOW_O2'] });
  a.update({ ...base, alerts: ['SLOPE_AHEAD', 'LOW_O2'], card: { id: 1, name: 'First ridges' } });
  assert.deepEqual(said.map((s) => s[0]), ['slope_ahead', 'low_o2'], 'no arrival line while talking');
  a.toggle();
  a.update({ ...base, alerts: ['SOLAR_STORM'] });
  assert.equal(tones.length, 3);
});

test('every line the phone can say is in the script', async () => {
  const fs = await import('node:fs');
  const { clipTexts } = await import('../tools/clip-texts.mjs');
  const { ALL_CLIPS, clipFor } = await import('../js/voice-clips.js');
  const mission = JSON.parse(fs.readFileSync(new URL('../../mission/mission.json', import.meta.url)));
  const ids = Object.keys(clipTexts(mission));
  for (const id of [...ALL_CLIPS, 'arrive_1', 'arrive_5', 'sample_1', 'sample_5', clipFor('RETURN_TO_BASE', 'Solar storm: radiation rising')]) {
    assert.ok(ids.includes(id), `${id} is in the script`);
  }
});

test('alerts are recorded in the voice agent\'s voice (once the clips are made)', async (t) => {
  const fs = await import('node:fs');
  const { clipTexts } = await import('../tools/clip-texts.mjs');
  const made = JSON.parse(fs.readFileSync(new URL('../sounds/clips.json', import.meta.url)));
  if (!made.voice) { t.skip('not recorded yet: run tools/make-voice-clips-elevenlabs.mjs'); return; }
  assert.match(made.voice, /^elevenlabs:/, 'ElevenLabs voice, not a computer voice');
  const mission = JSON.parse(fs.readFileSync(new URL('../../mission/mission.json', import.meta.url)));
  for (const id of Object.keys(clipTexts(mission))) {
    assert.ok(fs.existsSync(new URL(`../sounds/${id}.${made.ext}`, import.meta.url)), `${id} was recorded`);
  }
});

test('the same line asked for twice plays once', async () => {
  const { createClipPlayer } = await import('../js/voice-clips.js');
  let t = 0;
  const p = createClipPlayer({ ctx: () => ({}), base: '', fetchFn: () => Promise.resolve({ ok: false }), clock: () => t });
  assert.equal(p.play('slope_ahead'), true);
  assert.equal(p.play('slope_ahead'), false, 'danger beeper + alerts both asked: once');
  t = 9000;
  assert.equal(p.play('slope_ahead'), true, 'later it may play again');
});

test('a line with no recording is said by the fallback voice instead of staying silent', async () => {
  const { createClipPlayer } = await import('../js/voice-clips.js');
  const { createSpeechFallback } = await import('../js/speech-fallback.js');
  const { clipTexts } = await import('../js/clip-texts.js');
  const spoken = [];
  const synth = { speak: (u) => spoken.push(u.text), cancel: () => {} };
  function Utterance(text) { this.text = text; }
  const fallback = createSpeechFallback({ texts: clipTexts({ stops: [] }), synth, Utterance });
  const player = createClipPlayer({ ctx: () => ({}), base: '', fetchFn: async () => ({ ok: false }), fallback, clock: () => 0 });
  player.play('slope_ahead');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(spoken, ['Steep ground ahead. Slow down.']);
});

test('an urgent alert cuts the line playing but keeps other alerts waiting', async () => {
  const { createClipPlayer } = await import('../js/voice-clips.js');
  const started = [];
  const audio = { state: 'running', destination: {}, decodeAudioData: (b, ok) => ok({}),
    createBufferSource: () => { const src = { connect() {}, start() { started.push(src.id); }, stop() {} }; return src; } };
  const p = createClipPlayer({ ctx: () => audio, base: '', fetchFn: async (u) => ({ ok: true, arrayBuffer: async () => u }), clock: () => 0 });
  p.play('arrive_1');
  p.play('slope_ahead');
  p.play('return_solar', { urgent: true });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(p.play('slope_ahead'), false, 'still waiting in line, not dropped');
});
