import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaClock, hoursMinutes } from '../js/core/eva-clock.js';
import { doseText } from '../js/view/visor/panels.js';

test('the sim walk starts at 09:00 Mars time, in daylight', () => {
  const c = evaClock(0);
  assert.equal(c.marsTime, '09:00');
  assert.equal(c.daylightMin, 9 * 60);
  assert.equal(c.elapsedMin, 0);
});

test('daylight counts down and never goes negative', () => {
  assert.equal(evaClock(90 * 60000).marsTime, '10:30');
  assert.equal(evaClock(90 * 60000).daylightMin, 450);
  assert.equal(evaClock(20 * 3600000).daylightMin, 0);
  assert.equal(hoursMinutes(65), '1h 05m');
});

test('radiation dose is readable from the first minute', () => {
  assert.equal(doseText(0.37), '0.4 µSv');
  assert.equal(doseText(42.4), '42 µSv');
  assert.equal(doseText(1520), '1.52 mSv');
});
