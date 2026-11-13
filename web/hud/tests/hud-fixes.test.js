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
