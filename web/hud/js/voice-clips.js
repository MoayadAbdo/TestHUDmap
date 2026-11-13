import { RETURN_REASONS } from './core/alerts.js';

/**
 * Plays the recorded alert lines (sounds/*.m4a, one voice for everyone; see tools/make-voice-clips.mjs).
 * One line at a time; an urgent line cuts the one playing. Missing clips are skipped (the visor still shows it).
 */
export function createClipPlayer({ ctx, base, fetchFn = (u) => fetch(u) }) {
  const buffers = new Map();
  const queue = [];
  let playing = null;

  async function load(id) {
    if (!buffers.has(id)) {
      buffers.set(id, fetchFn(`${base}${id}.m4a`).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? new Promise((ok, fail) => ctx().decodeAudioData(b, ok, fail)) : null)).catch(() => null));
    }
    return buffers.get(id);
  }

  async function next() {
    if (playing || !queue.length) return;
    const id = queue.shift();
    const buffer = await load(id);
    if (!buffer) { next(); return; }
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
      if (urgent) {
        queue.length = 0;
        try { playing?.stop(); } catch { /* already done */ }
        playing = null;
      }
      queue.push(id);
      next();
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
