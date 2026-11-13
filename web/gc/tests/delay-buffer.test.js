import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDelayBuffer, framesFor, MAX_FRAMES } from '../delay-buffer.js';

test('shows the picture from `delay` ago', () => {
  const buffer = createDelayBuffer();
  for (let t = 0; t <= 30; t++) buffer.add(t * 1000, `frame ${t}`);
  assert.equal(buffer.frameAt(30_000 - 20_000), 'frame 10');
  assert.equal(buffer.frameAt(10_500), 'frame 10');
});

test('nothing to show until the first picture is old enough', () => {
  const buffer = createDelayBuffer();
  buffer.add(5000, 'first');
  assert.equal(buffer.frameAt(5000 - 20_000), null);
  assert.equal(buffer.oldestTime, 5000);
});

test('keeps only what the delay needs', () => {
  const buffer = createDelayBuffer(framesFor(20));
  for (let t = 0; t < 100; t++) buffer.add(t * 1000, t);
  assert.equal(buffer.size, 25);
  assert.equal(buffer.frameAt(99_000 - 20_000), 79);
});

test('memory is capped, even for the 22 min delay', () => {
  assert.equal(framesFor(1335), 1340);
  assert.equal(framesFor(3600), MAX_FRAMES);
  const buffer = createDelayBuffer(10_000);
  for (let t = 0; t < 2000; t++) buffer.add(t, t);
  assert.equal(buffer.size, MAX_FRAMES);
});

test('a smaller delay drops old pictures; clear empties it', () => {
  const buffer = createDelayBuffer(framesFor(60));
  for (let t = 0; t < 65; t++) buffer.add(t * 1000, t);
  buffer.resize(framesFor(20));
  assert.equal(buffer.size, 25);
  assert.equal(buffer.oldestTime, 40_000);
  buffer.clear();
  assert.equal(buffer.size, 0);
  assert.equal(buffer.frameAt(1e12), null);
});
