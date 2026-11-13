/**
 * Alerts you can hear, for the VR box where reading is hard: a tone for each kind of event and the phone's own
 * voice saying what happened (built in: no internet, no credits). Real dangers always speak; the rest waits
 * while you're talking to the AI. Everything is passed in, so it can be tested without speakers.
 */
const SPOKEN = {
  RETURN_TO_BASE: (s) => `Return to base. ${s.returnReason ?? ''}`,
  SOLAR_STORM: () => 'Solar storm. Radiation rising.',
  O2_LEAK: () => 'Suit oxygen leak.',
  LOW_O2: () => 'Oxygen low.',
  SLOPE_NO_GO: () => 'No-go slope ahead. Do not go on.',
  SLOPE_AHEAD: () => 'Steep ground ahead. Slow down.',
};
const DANGER = new Set(['RETURN_TO_BASE', 'SOLAR_STORM', 'O2_LEAK', 'LOW_O2', 'SLOPE_NO_GO']);
const REPEAT_MS = 30000;                 // the same warning at most every 30 s (no nagging when it flickers)

export function createAlertSounds({ tone, speak, isTalking = () => false, clock = () => performance.now() }) {
  let alerts = new Set();
  let cardId = null;
  let message = null;
  let samples = null;
  let on = true;
  const lastSaid = new Map();

  function say(key, text, { urgent = false } = {}) {
    const t = clock();
    if (t - (lastSaid.get(key) ?? -Infinity) < REPEAT_MS) return;
    if (isTalking() && !urgent) return;
    lastSaid.set(key, t);
    speak(text, { urgent });
  }

  return {
    /** Call every frame with the visor's state. */
    update(s) {
      if (!s) return;
      const now = new Set(s.alerts ?? []);
      if (on) {
        for (const a of now) {
          if (alerts.has(a)) continue;
          tone(DANGER.has(a) ? 'danger' : 'warn');
          if (SPOKEN[a]) say(a, SPOKEN[a](s), { urgent: DANGER.has(a) });
        }
        if (s.card && s.card.id !== cardId) {
          tone('arrive');
          say(`stop${s.card.id}`, `Stop ${s.card.id} reached: ${s.card.name}.${s.card.task ? ` ${s.card.task}` : ''}`);
        }
        if (s.message && s.message !== message && s.message.startsWith('Ground Control:')) {
          tone('message');
          say(`msg:${s.message}`, `Message from ${s.message}`, { urgent: true });
        }
        if (samples != null && (s.science?.done ?? 0) > samples) {
          tone('sample');
          say(`sample${s.science.done}`, `Sample logged. ${s.science.done} of ${s.science.total}.`);
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
export function makeTones() {
  let ctx = null;
  const NOTES = {
    arrive: [[660, 0], [880, 0.12]],
    sample: [[988, 0], [1319, 0.1], [1760, 0.2]],
    message: [[740, 0], [554, 0.16]],
    warn: [[520, 0]],
    danger: [[880, 0], [880, 0.18], [880, 0.36]],
  };
  return (kind) => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
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

/** The phone's own voice. Urgent lines cut in; others queue. */
export function makeSpeaker() {
  return (text, { urgent = false } = {}) => {
    try {
      if (urgent) window.speechSynthesis?.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis?.speak(u);
    } catch { /* no speech: the visor still shows it */ }
  };
}
