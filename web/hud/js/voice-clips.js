import { RETURN_REASONS } from './core/alerts.js';

/**
 * Plays the recorded alert lines (sounds/*.mp3 in the voice agent's voice; see tools/make-voice-clips-elevenlabs.mjs).
 * One line at a time; an urgent line cuts the one playing. A missing clip goes to fallback(id) (the phone's own voice).
 */
export const SAME_LINE_MS = 8000;    // the same line asked for twice (two alert systems, a flicker) plays once

export function createClipPlayer({ ctx, base, ext = 'mp3', fetchFn = (u) => fetch(u), clock = () => performance.now(), fallback = null }) {
  const buffers = new Map();
  const lastAsked = new Map();
  const queue = [];
  let playing = null;

  async function load(id) {
    if (!buffers.has(id)) {
      buffers.set(id, fetchFn(`${base}${id}.${ext}`).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? new Promise((ok, fail) => ctx().decodeAudioData(b, ok, fail)) : null)).catch(() => null));
    }
    return buffers.get(id);
  }

  async function next() {
    if (playing || !queue.length) return;
    const { id, urgent } = queue.shift();
    const buffer = await load(id);
    if (!buffer) { fallback?.(id, { urgent }); next(); return; }
    const audio = ctx();
    if (audio.state === 'suspended') audio.resume?.();     // phones pause audio in the background: wake it, don't go silent
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    playing = { src, id };
    src.onended = () => { if (playing?.src === src) playing = null; next(); };
    src.start();
  }

  return {
    /** Load the clips now, so the first warning plays at once. */
    preload: (ids) => ids.forEach(load),
    play(id, { urgent = false } = {}) {
      const t = clock();
      const waiting = playing?.id === id || queue.some((q) => q.id === id);
      if (waiting || t - (lastAsked.get(id) ?? -Infinity) < SAME_LINE_MS) return false;
      lastAsked.set(id, t);
      if (urgent) {
        // cut what's playing, but keep the other alerts waiting: only arrivals / samples / messages are dropped
        for (let i = queue.length - 1; i >= 0; i--) if (!ALERT_LINES.has(queue[i].id)) queue.splice(i, 1);
        try { playing?.src.stop(); } catch { /* already done */ }
        playing = null;
      }
      queue.push({ id, urgent });
      next();
      return true;
    },
  };
}

/** Which recorded line goes with an alert (return to base says why). */
export function clipFor(alert, returnReasonText = null) {
  if (alert === 'RETURN_TO_BASE') {
    const key = Object.keys(RETURN_REASONS).find((k) => RETURN_REASONS[k] === returnReasonText);
    return key ? `return_${key}` : 'return_generic';
  }
  return { SOLAR_STORM: 'solar', O2_LEAK: 'o2leak', LOW_O2: 'low_o2', SLOPE_NO_GO: 'slope_nogo', SLOPE_AHEAD: 'slope_ahead' }[alert] ?? null;
}

const ALERT_LINES = new Set(['return_reserve', 'return_low_o2', 'return_solar', 'return_o2leak', 'return_ground', 'return_generic',
  'solar', 'o2leak', 'low_o2', 'slope_nogo', 'slope_ahead', 'slope_close']);

export const ALL_CLIPS = ['return_reserve', 'return_low_o2', 'return_solar', 'return_o2leak', 'return_ground', 'return_generic',
  'solar', 'o2leak', 'low_o2', 'slope_nogo', 'slope_ahead', 'slope_close', 'gc_message', 'all_done'];
