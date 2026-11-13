import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STILL, combine, createMoveInput, keyVector, padVector } from '../js/move-input.js';

test('keys: W walks, S backs, A/D sideways, Q/E and arrows turn, Shift runs', () => {
  assert.deepEqual(keyVector(new Set(['KeyW', 'ShiftLeft'])), { forward: 1, right: 0, turn: 0, run: true, boost: 0 });
  assert.deepEqual(keyVector(new Set(['KeyS', 'KeyD'])), { forward: -1, right: 1, turn: 0, run: false, boost: 0 });
  assert.deepEqual(keyVector(new Set(['ArrowLeft'])), { forward: 0, right: 0, turn: -1, run: false, boost: 0 });
  assert.deepEqual(keyVector(new Set(['KeyW', 'KeyS'])), STILL);
});

test('gamepad: left stick walks, right stick turns, small wobble ignored', () => {
  const pad = { axes: [0.1, -0.9, 0.5, 0], buttons: [{}, {}, {}, {}, { pressed: true }] };
  assert.deepEqual(padVector(pad), { forward: 0.9, right: 0, turn: 0.5, run: true, boost: 0 });
  assert.deepEqual(padVector(null), STILL);
});

test('combine clamps to -1..1', () => {
  assert.equal(combine({ forward: 1, right: 0, turn: 0, run: false }, { forward: 1, right: 0, turn: 0, run: false }).forward, 1);
});

function fakeWin() {
  const handlers = {};
  return { handlers, addEventListener: (t, fn) => { handlers[t] = fn; }, requestAnimationFrame: () => {} };
}

test('steering reaches the sim; Ground Control must keep sending', () => {
  const win = fakeWin();
  let t = 0;
  const got = [];
  const input = createMoveInput({ win, sim: { setMoveInput: (v) => got.push(v) }, clock: () => t, getPads: () => [] });
  win.handlers.keydown({ code: 'KeyW', repeat: false, preventDefault() {} });
  input.poll();
  assert.equal(got.at(-1).forward, 1);
  win.handlers.keyup({ code: 'KeyW' });
  input.remote({ forward: 0, right: 1, turn: 0, run: false, boost: 3 });
  input.poll();
  assert.equal(got.at(-1).right, 1);
  assert.equal(got.at(-1).boost, 3, 'Ground Control speed reaches the sim');
  t = 1100;                      // link went quiet: stop
  input.poll();
  assert.deepEqual(got.at(-1), STILL);
});

test('T and gamepad B toggle auto-walk, gamepad A talks', () => {
  const win = fakeWin();
  const calls = [];
  let buttons = [];
  const input = createMoveInput({
    win, sim: { setMoveInput() {} }, getPads: () => [{ axes: [], buttons }],
    onVoice: () => calls.push('voice'), onToggleWalk: () => calls.push('walk'),
  });
  win.handlers.keydown({ code: 'KeyT', repeat: false, preventDefault() {} });
  buttons = [{ pressed: true }, { pressed: false }];
  input.poll();
  input.poll();                  // held: only once
  buttons = [{ pressed: false }, { pressed: true }];
  input.poll();
  assert.deepEqual(calls, ['walk', 'voice', 'walk']);
});
