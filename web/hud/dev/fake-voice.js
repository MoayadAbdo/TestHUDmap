/** Stand-in for T1.2: answers from hud.getStatus() after a short pause, so the voice button can be tested. */
export function createFakeVoice({ getStatus, timers = window, log = console }) {
  const listeners = [];
  let listening = false;

  function say(text) {
    listeners.forEach((cb) => cb(text));
  }

  return {
    toggle() {
      listening = !listening;
      if (!listening) return;
      timers.setTimeout(() => {
        listening = false;
        const s = getStatus();
        say(s.must_return
          ? `Oxygen is ${s.o2_pct}%. Head back now: base is ${s.dist_base_m} metres away.`
          : `Oxygen is ${s.o2_pct}%. ${s.stop_name} is ${s.dist_next_m} metres ahead.`);
      }, 1500);
    },
    sendContext(text) {
      log.debug?.(`[fake voice] context: ${text}`);
    },
    onText(callback) {
      listeners.push(callback);
    },
    get listening() {
      return listening;
    },
    get state() {
      return listening ? 'connected' : 'disconnected';
    },
  };
}
