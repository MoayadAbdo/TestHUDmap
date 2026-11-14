import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseMessage, createBaseFix } from '../js/core/base-fix.js';
import { gpsWarning } from '../js/core/gps-health.js';
import { creditLine, siteName } from '../js/core/mission-info.js';
import { buildStatus } from '../js/core/status.js';
import { CLICKER_KEYS, LONG_PRESS_MS, bindInput } from '../js/input.js';
import { guideSide } from '../js/view/visor/ground.js';

test('base fix: good fix at once, weak fixes only after waiting, forced fix always', () => {
  let t = 0;
  const fix = createBaseFix({ clock: () => t });
  assert.equal(fix.choose({ accuracy: 60 }), null);
  t = 10_000;
  assert.equal(fix.choose({ accuracy: 60 }), null);
  t = 25_000;
  assert.deepEqual(fix.choose({ accuracy: 60 }), { accuracy: 60 });
  assert.deepEqual(createBaseFix({ clock: () => 0 }).choose({ accuracy: 15 }), { accuracy: 15 });
  const forced = createBaseFix({ clock: () => 0 });
  forced.force({ accuracy: 300, at: [1, 2] });
  assert.deepEqual(forced.choose(null), { accuracy: 300, at: [1, 2] });
  assert.equal(forced.choose({ accuracy: 300 }), null);
});

test('base message warns when the fix is weak', () => {
  assert.equal(baseMessage(12), 'Base set here (GPS ±12 m)');
  assert.match(baseMessage(60), /±60 m, weak/);
});

test('gps warning: approximate, stuck, weak, fine', () => {
  assert.match(gpsWarning({ fixAt: 1000, accuracy: 500 }, 2000), /approximate/);
  assert.match(gpsWarning({ fixAt: 1000, accuracy: 10 }, 13_000), /not updating \(12 s\)/);
  assert.match(gpsWarning({ fixAt: 1000, accuracy: 40 }, 2000), /weak/);
  assert.equal(gpsWarning({ fixAt: 1000, accuracy: 8 }, 2000), '');
  assert.equal(gpsWarning(null, 0), '');
});

test('site name reads text or { name }', () => {
  assert.equal(siteName('Mount Sharp boxwork, Gale Crater, Mars'), 'Mount Sharp boxwork');
  assert.equal(siteName({ name: 'Gale' }), 'Gale');
  assert.equal(siteName(undefined), 'Mars');
});

test('credit line reads text or an object', () => {
  assert.equal(creditLine('NASA/JPL-Caltech'), 'NASA/JPL-Caltech');
  assert.equal(creditLine({ credit: 'NASA/JPL-Caltech', camera: 'Navcam', sol: 4639 }), 'NASA/JPL-Caltech · Navcam · 4639');
  assert.equal(creditLine(null), '');
});

test('status never sends Infinity or NaN', () => {
  const s = buildStatus({
    nav: { target: { id: 1, name: 'A' }, distanceM: 10, baseDistanceM: Infinity },
    stopCount: 5, marsPerFrameMetre: 1, o2Pct: 50, o2MinutesLeft: Infinity, mustReturn: false,
    conditions: { rad_uSv_h: NaN, temp_c: -48 },
  });
  assert.equal(s.o2_minutes_left, null);
  assert.equal(s.dist_base_m, null);
  assert.equal(s.rad_uSv_h, null);
  assert.equal(s.temp_c, -48);
  assert.ok(!JSON.stringify(s).includes('Infinity'));
});

test('guide shows only in the clear middle; otherwise the way to turn', () => {
  const view = { centerX: 800, focalPx: 1331 };
  const clear = { minX: 500, maxX: 1100 };
  assert.equal(guideSide({ forward: 50, right: 2 }, view, clear), 'guide');
  // 20° left lands under the left panel (x ≈ 316 px)
  const t20 = { forward: 50 * Math.cos(0.349), right: -50 * Math.sin(0.349) };
  assert.equal(guideSide(t20, view, clear), 'left');
  assert.equal(guideSide({ forward: -5, right: 1 }, view, clear), 'right');
  assert.equal(guideSide({ forward: 0.5, right: -0.1 }, view, clear), 'left');   // under your feet
});

function fakeTarget() {
  const handlers = {};
  return { handlers, addEventListener: (type, fn) => { handlers[type] = fn; } };
}

test('visor text drops voice-style tags', async () => {
  const { visorText } = await import('../js/adapters.js');
  assert.equal(visorText("[calm] I'm here whenever you're ready."), "I'm here whenever you're ready.");
  assert.equal(visorText('Oxygen is fine [pause] keep going'), 'Oxygen is fine keep going');
  assert.equal(visorText('Stop [2] is ahead'), 'Stop is ahead');
});

test('input: a double tap is its own action; a single tap waits to be sure', async () => {
  const { bindInput, DOUBLE_TAP_MS } = await import('../js/input.js');
  const canvas = fakeTarget(); const win = fakeTarget(); const calls = [];
  bindInput({ canvas, win, clock: () => 0, onTap: () => calls.push('tap'), onDoubleTap: () => calls.push('double'), onLongPress() {}, onClicker() {} });
  canvas.handlers.pointerdown(); canvas.handlers.pointerup();
  canvas.handlers.pointerdown(); canvas.handlers.pointerup();
  canvas.handlers.pointerdown(); canvas.handlers.pointerup();
  await new Promise((r) => setTimeout(r, DOUBLE_TAP_MS + 50));
  assert.deepEqual(calls, ['double', 'tap']);
});

test('input: tap, long-press and clicker keys', () => {
  const canvas = fakeTarget();
  const win = fakeTarget();
  let t = 0;
  const calls = [];
  bindInput({ canvas, win, clock: () => t, onTap: () => calls.push('tap'), onLongPress: () => calls.push('long'), onClicker: () => calls.push('click') });
  canvas.handlers.pointerdown(); t = 100; canvas.handlers.pointerup();
  canvas.handlers.pointerdown(); t += LONG_PRESS_MS; canvas.handlers.pointerup();
  let prevented = false;
  win.handlers.keydown({ key: 'Enter', repeat: false, preventDefault: () => { prevented = true; } });
  win.handlers.keydown({ key: 'Enter', repeat: true, preventDefault() {} });
  win.handlers.keydown({ key: 'x', repeat: false, preventDefault() {} });
  assert.deepEqual(calls, ['tap', 'long', 'click']);
  assert.ok(prevented);
  assert.ok(CLICKER_KEYS.has('MediaPlayPause'));
});

test('one word for the way to go', async () => {
  const { turnWord } = await import('../js/view/visor/overlay.js');
  assert.equal(turnWord(10), '');
  assert.equal(turnWord(-60), 'TURN LEFT');
  assert.equal(turnWord(90), 'TURN RIGHT');
  assert.equal(turnWord(-170), 'TURN AROUND');
});

test('suit panels: in after standing still 3 s, out when walking, pinned with the toggle', async () => {
  const { createDetailAuto, STILL_MS } = await import('../js/core/detail-auto.js');
  const d = createDetailAuto({ start: 'auto' });
  let t = 0;
  const run = (ms, speedMps, busy = false) => { for (let end = t + ms; t < end; t += 100) d.update(t, { speedMps, busy }); return d.level; };
  assert.equal(run(2000, 1), 0, 'walking: light view');
  assert.equal(run(STILL_MS - 500, 0), 0, 'not yet');
  assert.equal(run(1500, 0), 1, 'standing still: every panel');
  assert.equal(run(1000, 0.2), 1, 'shuffling on the spot does not hide them');
  assert.equal(run(1000, 1), 0, 'walking again: gone');
  assert.equal(run(5000, 0, true), 0, 'not on top of a stop card');
  d.toggle();
  assert.equal(run(1000, 1), 1, 'pinned on while walking');
  d.reset();
  assert.equal(run(1000, 1), 0);
});

test('oxygen time left reads steady when effort changes step to step', async () => {
  const { createSuit } = await import('../js/core/suit.js');
  const suit = createSuit({ o2StartPct: 100, o2PctPerMin: 0.25, startMs: 0 });
  const before = suit.minutesLeft;
  suit.setEffort(2);                 // one hard step
  suit.update(1000);
  assert.ok(suit.minutesLeft > before * 0.95, `${Math.round(suit.minutesLeft)} vs ${Math.round(before)}: no jump`);
  for (let t = 2000; t <= 600000; t += 1000) suit.update(t);
  assert.ok(suit.minutesLeft < before * 0.6, 'after minutes of hard walking it does come down');
});

test('the calm focus view is the default; I pins every panel on', async () => {
  const { createDetailAuto } = await import('../js/core/detail-auto.js');
  const d = createDetailAuto();
  assert.equal(d.mode, 'auto');
  d.update(0, { speedMps: 1 }); assert.equal(d.update(1000, { speedMps: 1 }), 0);
  assert.equal(d.toggle(), 'full');
  d.reset(); assert.equal(d.mode, 'auto');
});

test('alerts: no-go ground first, then the way home (it names its cause), then the rest', async () => {
  const { evaluateAlerts } = await import('../js/core/alerts.js');
  const r = evaluateAlerts({ slopeAheadDeg: 25, o2Pct: 20, o2MinutesLeft: 30, walkBackMinutes: 5, alreadyReturning: false, hazard: 'solar' });
  assert.deepEqual(r.alerts, ['SLOPE_NO_GO', 'RETURN_TO_BASE', 'SOLAR_STORM', 'LOW_O2']);
});

