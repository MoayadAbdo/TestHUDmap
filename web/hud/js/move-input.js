/**
 * Moving on the 3D Mars without walking for real (sim mode): WASD / arrows on a Bluetooth keyboard,
 * a gamepad, or Ground Control driving from the laptop. Feeds sim.setMoveInput({ forward, right, turn, run }).
 */
const KEY_MOVES = {
  KeyW: ['forward', 1], ArrowUp: ['forward', 1], KeyS: ['forward', -1], ArrowDown: ['forward', -1],
  KeyA: ['right', -1], KeyD: ['right', 1],
  KeyQ: ['turn', -1], KeyE: ['turn', 1],   // ←/→ stay free for page-turner clickers (they talk to the AI)
};
const RUN_CODES = new Set(['ShiftLeft', 'ShiftRight']);
// boost: speed × for this steering (Ground Control's Drive speed); 0 = use the phone's own ?speed
export const STILL = Object.freeze({ forward: 0, right: 0, turn: 0, run: false, boost: 0 });
const DEAD_ZONE = 0.18;
const REMOTE_FRESH_MS = 1000;    // Ground Control keeps sending; if the link drops you stop, never keep walking
const PAD = { voice: 0, autoWalk: 1, layer: 2, card: 3, runButtons: [4, 5, 6, 7] };   // A talks, B auto-walks, X layer, Y card, shoulders run

const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
const dead = (v) => (Math.abs(v) < DEAD_ZONE ? 0 : v);

/** Held keys (KeyboardEvent.code) → move. */
export function keyVector(pressed) {
  const v = { forward: 0, right: 0, turn: 0, run: false, boost: 0 };
  for (const code of pressed) {
    if (KEY_MOVES[code]) v[KEY_MOVES[code][0]] += KEY_MOVES[code][1];
    if (RUN_CODES.has(code)) v.run = true;
  }
  return sanitize(v);
}

/** Standard gamepad → move: left stick walks / strafes, right stick turns. */
export function padVector(pad) {
  if (!pad) return STILL;
  const axis = (i) => dead(pad.axes?.[i] ?? 0);
  return sanitize({
    forward: -axis(1), right: axis(0), turn: axis(2),
    run: PAD.runButtons.some((i) => pad.buttons?.[i]?.pressed),
  });
}

export function sanitize(v) {
  const boost = Number(v?.boost) > 0 ? Math.min(10, Math.max(1, Number(v.boost))) : 0;
  return { forward: clamp(v?.forward), right: clamp(v?.right), turn: clamp(v?.turn), run: !!v?.run, boost };
}

export function combine(...vectors) {
  return sanitize(vectors.reduce((a, b) => ({
    forward: a.forward + b.forward, right: a.right + b.right, turn: a.turn + b.turn, run: a.run || b.run,
    boost: Math.max(a.boost || 0, b.boost || 0),
  }), { forward: 0, right: 0, turn: 0, run: false, boost: 0 }));
}

const same = (a, b) => a.forward === b.forward && a.right === b.right && a.turn === b.turn && a.run === b.run && a.boost === b.boost;
export const isMove = (code) => code in KEY_MOVES || RUN_CODES.has(code);

/** Wires keys, the gamepad and Ground Control to sim.setMoveInput(). T or pad B: auto-walk; pad A: talk. */
export function createMoveInput({ win = window, sim, clock = () => performance.now(), getPads = () => navigator.getGamepads?.() ?? [], steps = null, onVoice, onToggleWalk, onCard, onLayer }) {
  const pressed = new Set();
  let remote = { v: STILL, at: -Infinity };
  let sent = STILL;
  let lastButtons = [];
  let running = true;

  win.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT' && !e.repeat) onToggleWalk?.();
    if (!isMove(e.code)) return;
    e.preventDefault();
    pressed.add(e.code);
  });
  win.addEventListener('keyup', (e) => pressed.delete(e.code));
  win.addEventListener('blur', () => pressed.clear());

  function poll() {
    const pad = [...getPads()].find(Boolean) ?? null;
    const buttons = pad?.buttons?.map((b) => b.pressed) ?? [];
    if (buttons[PAD.voice] && !lastButtons[PAD.voice]) onVoice?.();
    if (buttons[PAD.autoWalk] && !lastButtons[PAD.autoWalk]) onToggleWalk?.();
    if (buttons[PAD.card] && !lastButtons[PAD.card]) onCard?.();
    if (buttons[PAD.layer] && !lastButtons[PAD.layer]) onLayer?.();
    lastButtons = buttons;
    const fresh = clock() - remote.at < REMOTE_FRESH_MS;
    const stepping = steps?.walking(clock()) ? { ...STILL, forward: 1 } : STILL;   // walking in place on the phone
    const v = combine(keyVector(pressed), padVector(pad), fresh ? remote.v : STILL, stepping);
    if (!same(v, sent)) { sim.setMoveInput(v); sent = v; }
  }

  function loop() {
    if (!running) return;
    poll();
    win.requestAnimationFrame(loop);
  }
  loop();

  return {
    /** Ground Control's steering ({ forward, right, turn, run }); it must keep coming to stay on. */
    remote(v) {
      remote = { v: sanitize(v), at: clock() };
    },
    poll,
    stop() {
      running = false;
      sim.setMoveInput(STILL);
    },
  };
}
