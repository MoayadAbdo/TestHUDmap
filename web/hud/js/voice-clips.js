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
    const src = ctx().createBufferSource();
    src.buffer = buffer;
    src.connect(ctx().destination);
    playing = src;
    src.onended = () => { if (playing === src) playing = null; next(); };
    src.start();
  }

  return {
    /** Load the clips now, so the first warning plays at once. */
    preload: (ids) => ids.forEach(load),
    play(id, { urgent = false } = {}) {
      const t = clock();
      if (t - (lastAsked.get(id) ?? -Infinity) < SAME_LINE_MS) return false;
      lastAsked.set(id, t);
      if (urgent) {
        queue.length = 0;
        try { playing?.stop(); } catch { /* already done */ }
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

export const ALL_CLIPS = ['return_reserve', 'return_low_o2', 'return_solar', 'return_o2leak', 'return_ground', 'return_generic',
  'solar', 'o2leak', 'low_o2', 'slope_nogo', 'slope_ahead', 'slope_close', 'gc_message', 'all_done'];
