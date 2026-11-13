/**
 * Screen taps, long-press and the Bluetooth clicker.
 * Clickers must send keys (page-turner / keyboard mode). Cheap selfie remotes send volume keys,
 * which phone browsers usually keep for themselves: test yours first.
 */
export const LONG_PRESS_MS = 800;
export const CLICKER_KEYS = new Set([' ', 'Enter', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'v', 'V', 'MediaPlayPause', 'AudioVolumeUp', 'AudioVolumeDown']);
// Sim mode: WASD and the arrows move you, so only these talk to the AI
export const SIM_CLICKER_KEYS = new Set([' ', 'Enter', 'PageDown', 'PageUp', 'v', 'V', 'MediaPlayPause', 'AudioVolumeUp', 'AudioVolumeDown']);

export function bindInput({ canvas, win = window, clock = () => performance.now(), onTap, onLongPress, onClicker, clickerKeys = CLICKER_KEYS }) {
  let pressStart = 0;
  canvas.addEventListener('pointerdown', () => {
    pressStart = clock();
  });
  canvas.addEventListener('pointerup', () => {
    if (clock() - pressStart >= LONG_PRESS_MS) onLongPress();
    else onTap();
  });
  win.addEventListener('keydown', (e) => {
    if (!clickerKeys.has(e.key) || e.repeat) return;
    e.preventDefault();
    onClicker();
  });
}
