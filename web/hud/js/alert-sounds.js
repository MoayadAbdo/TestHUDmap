import { clipFor } from './voice-clips.js';

/**
 * Alerts you can hear, for the VR box where reading is hard: a tone for each kind of event and a recorded line in
 * the voice agent's voice (sounds/*.mp3, recorded once by tools/make-voice-clips-elevenlabs.mjs). Real dangers always speak; the rest waits while you're talking to the AI.
 * Everything is passed in, so it can be tested without speakers. say(clipId, { urgent }) plays a recorded line.
 */
const DANGER = new Set(['RETURN_TO_BASE', 'SOLAR_STORM', 'O2_LEAK', 'LOW_O2', 'SLOPE_NO_GO']);
const CAUSE_LINE = { SOLAR_STORM: 'return_solar', O2_LEAK: 'return_o2leak', LOW_O2: 'return_low_o2' };   // the return line that already says it
const ALERT_REPEAT_MS = 10000;           // every alert that starts is spoken; only a flicker within 10 s stays quiet
const OTHER_REPEAT_MS = 30000;           // arrivals, samples, messages

export function createAlertSounds({ tone, speak, isTalking = () => false, clock = () => performance.now() }) {
  let alerts = new Set();
  let cardId = null;
  let message = null;
  let samples = null;
  let on = true;
  const lastSaid = new Map();

  /** alert: true for safety alerts — they always speak, even while you talk to the AI. */
  function say(clip, { urgent = false, alert = false } = {}) {
    if (!clip) return;
    const t = clock();
    if (t - (lastSaid.get(clip) ?? -Infinity) < (alert ? ALERT_REPEAT_MS : OTHER_REPEAT_MS)) return;
    if (isTalking() && !alert && !urgent) return;
    lastSaid.set(clip, t);
    speak(clip, { urgent });
  }

  return {
    /** Call every frame with the visor's state. */
    update(s) {
      if (!s) return;
      const now = new Set(s.alerts ?? []);
      if (on) {
        // every alert that starts is spoken, most important first (s.alerts comes in priority order). Only the first
        // may cut a line already playing; the rest queue behind it instead of cutting each other off.
        const fresh = [...now].filter((a) => !alerts.has(a));
        if (fresh.length) tone(DANGER.has(fresh[0]) ? 'danger' : 'warn');
        fresh.forEach((a, i) => {
          if (fresh.includes('RETURN_TO_BASE') && CAUSE_LINE[a] === clipFor('RETURN_TO_BASE', s.returnReason)) return;   // the return line just said it
          say(clipFor(a, s.returnReason), { urgent: i === 0 && DANGER.has(a), alert: true });
        });
        if (s.card && s.card.id !== cardId) {
          tone('arrive');
          say(`arrive_${s.card.id}`);
        }
        if (s.message && s.message !== message && s.message.startsWith('Ground Control:')) {
          tone('message');
          say('gc_message', { urgent: true });           // the words are on the visor
        }
        if (s.message && s.message !== message && s.message.startsWith('All stops done')) say('all_done');
        if (samples != null && (s.science?.done ?? 0) > samples) {
          tone('sample');
          say(`sample_${s.science.done}`);
        }
      }
      alerts = now;
      cardId = s.card?.id ?? null;
      message = s.message;
      samples = s.science?.done ?? 0;
    },
    toggle() { on = !on; return on; },
    get on() { return on; },
  };
}

/** Short tones from WebAudio: arrive (rising), sample (bright), message (two notes), warn (one), danger (three fast). */
export function makeTones(getCtx) {
  const NOTES = {
    arrive: [[660, 0], [880, 0.12]],
    sample: [[988, 0], [1319, 0.1], [1760, 0.2]],
    message: [[740, 0], [554, 0.16]],
    warn: [[520, 0]],
    danger: [[880, 0], [880, 0.18], [880, 0.36]],
  };
  return (kind) => {
    try {
      const ctx = getCtx();
      for (const [freq, at] of NOTES[kind] ?? []) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = kind === 'danger' ? 'square' : 'sine';
        o.frequency.value = freq;
        g.gain.value = kind === 'danger' ? 0.06 : 0.1;
        o.connect(g).connect(ctx.destination);
        const t0 = ctx.currentTime + at;
        o.start(t0);
        g.gain.setValueAtTime(g.gain.value, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
        o.stop(t0 + 0.15);
      }
    } catch { /* no audio: the visor still shows it */ }
  };
}
