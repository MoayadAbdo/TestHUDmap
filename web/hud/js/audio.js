/**
 * One audio channel for the whole HUD (tones and recorded voice). Phones keep audio silent until a tap,
 * so unlock() runs inside the Start tap.
 */
let ctx = null;
export function audioContext() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}
export function unlockAudio() {
  try { audioContext().resume?.(); } catch { /* no audio on this device */ }
}
