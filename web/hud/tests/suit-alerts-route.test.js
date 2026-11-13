import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_RADIUS_M, fromOffset } from '../js/core/geo.js';
import { RETURN_REASONS, alertLevel, evaluateAlerts } from '../js/core/alerts.js';
import { slopeAhead } from '../js/core/route.js';
import { createSuit } from '../js/core/suit.js';

const near = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('oxygen drops 0.25% a minute, faster in demo speed', () => {
  const suit = createSuit({ o2StartPct: 100, o2PctPerMin: 0.25, startMs: 0 });
  near(suit.update(10 * 60000), 97.5, 1e-9);
  suit.setSpeed(20);
  near(suit.update(11 * 60000), 92.5, 1e-9);
  near(suit.minutesLeft, 92.5 / 5, 1e-9);
});

test('battery drains 0.2% a minute by default', () => {
  const suit = createSuit({ startMs: 0 });
  suit.update(10 * 60000);
  near(suit.powerPct, 98, 1e-9);
});

test('oxygen never goes below zero', () => {
  const suit = createSuit({ o2StartPct: 1, o2PctPerMin: 1, startMs: 0 });
  assert.equal(suit.update(10 * 60000), 0);
});

const calm = { slopeAheadDeg: 5, o2Pct: 80, o2MinutesLeft: 300, walkBackMinutes: 5, alreadyReturning: false };

test('no alerts when everything is fine', () => {
  assert.deepEqual(evaluateAlerts(calm), { alerts: [], mustReturn: false, reason: null });
});

test('each alert fires at its limit', () => {
  assert.deepEqual(evaluateAlerts({ ...calm, slopeAheadDeg: 12.5 }).alerts, ['SLOPE_AHEAD']);
  assert.deepEqual(evaluateAlerts({ ...calm, slopeAheadDeg: 20.5 }).alerts, ['SLOPE_NO_GO']);   // NASA's 20° EVA limit
  assert.deepEqual(evaluateAlerts({ ...calm, o2MinutesLeft: 14.9 }).alerts, ['RETURN_TO_BASE']);
});

test('low oxygen ends the walk, not just a warning', () => {
  const r = evaluateAlerts({ ...calm, o2Pct: 29 });
  assert.deepEqual(r.alerts, ['RETURN_TO_BASE', 'LOW_O2']);
  assert.equal(r.mustReturn, true);
  assert.equal(r.reason, 'low_o2');
});

test('a solar storm or O2 leak sends the astronaut home at once, with the reason', () => {
  const solar = evaluateAlerts({ ...calm, hazard: 'solar' });
  assert.deepEqual(solar, { alerts: ['RETURN_TO_BASE', 'SOLAR_STORM'], mustReturn: true, reason: 'solar' });
  assert.equal(RETURN_REASONS[solar.reason], 'Solar storm: radiation rising');
  assert.equal(evaluateAlerts({ ...calm, hazard: 'o2leak' }).alerts.includes('O2_LEAK'), true);
});

test('alert level: red for act-now, yellow for be-careful', () => {
  assert.equal(alertLevel([]), null);
  assert.equal(alertLevel(['SLOPE_AHEAD']), 'caution');
  assert.equal(alertLevel(['SLOPE_NO_GO']), 'danger');
  assert.equal(alertLevel(['RETURN_TO_BASE', 'LOW_O2']), 'danger');
});

test('return to base stays on once triggered', () => {
  assert.equal(evaluateAlerts({ ...calm, alreadyReturning: true }).mustReturn, true);
});

const at = (north) => fromOffset([0, 0], { east: 0, north }, EARTH_RADIUS_M);
const route = [
  { at: at(0), slope_deg: 3 },
  { at: at(10), slope_deg: 4 },
  { at: at(20), slope_deg: 14 },
  { at: at(60), slope_deg: 25 },
];

test('slope ahead looks only 30 m down the route', () => {
  assert.equal(slopeAhead(route, at(1), EARTH_RADIUS_M), 14);
  assert.equal(slopeAhead(route, at(58), EARTH_RADIUS_M), 25);
  assert.equal(slopeAhead([], at(0), EARTH_RADIUS_M), 0);
});
