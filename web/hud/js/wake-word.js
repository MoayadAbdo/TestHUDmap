/**
 * Hands-free voice: say "Hey suit" to talk to the AI (the phone is inside the VR box, so no buttons).
 * The phone's speech recognition listens only for the wake word; then the voice agent opens.
 * It closes itself after `idleMs` with nobody talking, and the wake word listens again (saves credits).
 * The Bluetooth clicker still works at any time.
 */
// "hey" is required: on stage we say "suit" all the time
const WAKE = /\b(hey|hi|ok|okay)[\s,]+(suit|suits|soot|sweet|suite)\b/i;
export const isWakePhrase = (text) => WAKE.test(text);

const RESTART_MS = 300;                       // phones stop listening after silence: start again
const OFFLINE_RETRY_MS = [2000, 5000, 10000, 30000];
const CONNECT_WAIT_MS = 4000;                 // old voice modules don't report "connecting"
const CONNECT_GIVE_UP_MS = 20000;

/**
 * mode: 'idle' (listening for the wake word) → 'waking' (agent connecting) → 'talking' → 'idle'.
 * Everything it touches is passed in, so it can be tested without a microphone.
 */
export function createWakeWord({ voice, notify = () => {}, SR, timers = globalThis, clock = () => Date.now(), chime = () => {}, idleMs = 15000 }) {
  let mode = 'idle';
  let rec = null;
  let stopped = false;
  let lastActivity = 0;
  let wokeAt = 0;
  let offlineTries = 0;
  let loop = null;
  const state = () => voice.state ?? (voice.listening ? 'connected' : 'disconnected');
  const active = () => { lastActivity = clock(); };
  voice.onText?.(active);
  voice.onUserText?.(active);

  function quiet() {
    try { rec?.abort(); } catch { /* already stopped */ }
    rec = null;
  }

  function listen() {
    if (stopped || mode !== 'idle' || rec) return;
    const r = new SR();
    rec = r;
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      if (offlineTries) { offlineTries = 0; notify('Voice back online'); }
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (isWakePhrase(e.results[i][0].transcript)) { wake(); return; }
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        notify('Microphone blocked: allow it to use "Hey suit"');
      } else if (e.error === 'network') {
        if (!offlineTries) notify('Voice offline: no internet');
        offlineTries += 1;
      }
    };
    r.onend = () => {
      if (rec === r) rec = null;
      if (stopped || mode !== 'idle') return;
      const wait = offlineTries ? OFFLINE_RETRY_MS[Math.min(offlineTries, OFFLINE_RETRY_MS.length) - 1] : RESTART_MS;
      timers.setTimeout(listen, wait);
    };
    try { r.start(); } catch { rec = null; timers.setTimeout(listen, 1000); }
  }

  function wake() {
    if (mode !== 'idle') return;
    mode = 'waking';
    wokeAt = clock();
    active();
    quiet();
    chime(880);
    notify('Listening… ask your question');
    voice.toggle();
  }

  function backToIdle(delayMs) {
    mode = 'idle';
    timers.setTimeout(listen, delayMs);
  }

  function check() {
    if (stopped) return;
    const s = state();
    const t = clock();
    if (mode === 'idle') {
      if (s !== 'disconnected') { mode = 'talking'; active(); quiet(); }   // opened with the clicker
    } else if (mode === 'waking') {
      if (s === 'connected') { mode = 'talking'; active(); }
      else if (s === 'disconnected' && t - wokeAt > CONNECT_WAIT_MS) backToIdle(0);
      else if (t - wokeAt > CONNECT_GIVE_UP_MS) { notify('AI not answering: say "Hey suit" again'); backToIdle(0); }
    } else if (mode === 'talking') {
      if (s === 'disconnected') backToIdle(800);
      else if (s === 'connected' && t - lastActivity > idleMs) {
        voice.toggle();                       // nobody spoke for a while: close it to save credits
        chime(520);
        notify('Say "Hey suit" to talk');
        backToIdle(800);
      }
    }
  }

  return {
    start() {
      loop = timers.setInterval(check, 1000);
      listen();
    },
    stop() {
      stopped = true;
      timers.clearInterval(loop);
      quiet();
    },
    get mode() {
      return mode;
    },
  };
}

function chime(freq) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.stop(ctx.currentTime + 0.26);
  } catch { /* no audio: fine */ }
}

/** Starts "Hey suit" in the browser. Returns null if this browser has no speech recognition. */
export function startWakeWord({ voice, notify }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    notify?.('Wake word not supported here: use the clicker to talk');
    return null;
  }
  const wakeWord = createWakeWord({ voice, notify, SR, timers: window, chime });
  wakeWord.start();
  notify?.('Say "Hey suit" to talk to the AI');
  return wakeWord;
}
