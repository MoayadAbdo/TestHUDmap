import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WALK_MS, createStepDetector } from '../js/core/steps.js';

/** Feeds a vertical bounce (amplitude m/s², steps per second) for `seconds` at 60 Hz; returns step times. */
function feed(detector, { amp, hz, seconds, t0 = 0 }) {
  for (let i = 0; i < seconds * 60; i++) {
    const t = t0 + (i * 1000) / 60;
    detector.update(0, 9.81 + amp * Math.sin(2 * Math.PI * hz * (t / 1000)), 0, t);
  }
}

test('walking in place (~1.8 steps a second) is counted step by step', () => {
  const times = [];
  const d = createStepDetector({ onStep: (t) => times.push(t) });
  feed(d, { amp: 3, hz: 1.8, seconds: 10 });
  assert.ok(times.length >= 16 && times.length <= 19, `${times.length} steps`);
});

test('turning the head or small sways are not steps', () => {
  const times = [];
  const d = createStepDetector({ onStep: (t) => times.push(t) });
  feed(d, { amp: 0.6, hz: 1, seconds: 10 });
  assert.equal(times.length, 0);
});

test('shaking the phone fast does not count as running', () => {
  const times = [];
  const d = createStepDetector({ onStep: (t) => times.push(t) });
  feed(d, { amp: 4, hz: 8, seconds: 5 });
  assert.ok(times.length <= 5 * 3.6, `${times.length} steps in 5 s`);
});

test('you keep walking for a moment after each step, then stop', () => {
  let last = 0;
  const d = createStepDetector({ onStep: (t) => { last = t; } });
  feed(d, { amp: 3, hz: 1.8, seconds: 2 });
  assert.ok(d.walking(last + WALK_MS - 10));
  assert.ok(!d.walking(last + WALK_MS + 10));
});
