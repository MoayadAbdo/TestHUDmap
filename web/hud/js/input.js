/**
 * Screen taps, long-press and the Bluetooth clicker.
 * Clickers must send keys (page-turner / keyboard mode). Cheap selfie remotes send volume keys,
 * which phone browsers usually keep for themselves: test yours first.
 */
export const LONG_PRESS_MS = 800;
export const CLICKER_KEYS = new Set([' ', 'Enter', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'v', 'V', 'MediaPlayPause', 'AudioVolumeUp', 'AudioVolumeDown']);

export function bindInput({ canvas, win = window, clock = () => performance.now(), onTap, onLongPress, onClicker }) {
  let pressStart = 0;
  canvas.addEventListener('pointerdown', () => {
    pressStart = clock();
  });
  canvas.addEventListener('pointerup', () => {
    if (clock() - pressStart >= LONG_PRESS_MS) onLongPress();
    else onTap();
  });
  win.addEventListener('keydown', (e) => {
    if (!CLICKER_KEYS.has(e.key) || e.repeat) return;
    e.preventDefault();
    onClicker();
  });
}
