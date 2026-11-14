/**
 * Screen taps, long-press and the Bluetooth clicker.
 * Clickers must send keys (page-turner / keyboard mode). Cheap selfie remotes send volume keys,
 * which phone browsers usually keep for themselves: test yours first.
 */
export const LONG_PRESS_MS = 800;
export const DOUBLE_TAP_MS = 350;
export const CLICKER_KEYS = new Set([' ', 'Enter', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'v', 'V', 'MediaPlayPause', 'AudioVolumeUp', 'AudioVolumeDown']);
// Sim mode: WASD and ↑/↓ move you; ←/→ stay here because page-turner clickers send them
export const SIM_CLICKER_KEYS = new Set([' ', 'Enter', 'PageDown', 'PageUp', 'ArrowLeft', 'ArrowRight', 'v', 'V',
  'MediaPlayPause', 'AudioVolumeUp', 'AudioVolumeDown']);

export function bindInput({ canvas, win = window, clock = () => performance.now(), onTap, onDoubleTap, onLongPress, onClicker, onCard, onLayer, onDetail, onTools, clickerKeys = CLICKER_KEYS }) {
  let pressStart = 0;
  canvas.addEventListener('pointerdown', () => {
    pressStart = clock();
  });
  // a double tap (only when there's a double-tap action) waits a moment to tell it from a single tap
  let tapTimer = null;
  canvas.addEventListener('pointerup', () => {
    if (clock() - pressStart >= LONG_PRESS_MS) { onLongPress?.(); return; }   // a hold (or a drag to look) is not a tap
    if (!onDoubleTap) { onTap(); return; }
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; onDoubleTap(); return; }
    tapTimer = setTimeout(() => { tapTimer = null; onTap(); }, DOUBLE_TAP_MS);
  });
  win.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.repeat) { onCard?.(); return; }   // close / reopen the stop card
    if ((e.key === 'l' || e.key === 'L') && !e.repeat) { onLayer?.(); return; }  // next map layer on the ground
    if ((e.key === 'i' || e.key === 'I') && !e.repeat) { onDetail?.(); return; } // focus view ↔ all panels
    if ((e.key === 'm' || e.key === 'M') && !e.repeat) { onTools?.(); return; }  // test buttons: show / hide
    if (!clickerKeys.has(e.key) || e.repeat) return;
    e.preventDefault();
    onClicker();
  });
}
