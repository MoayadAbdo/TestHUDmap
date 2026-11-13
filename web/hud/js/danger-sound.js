/**
 * Danger you can hear (no reading needed in the VR box): a parking-sensor beep that speeds up as no-go ground gets
 * closer, and the phone's own voice for "Steep slope ahead, 15 metres" (built in: no internet, no credits).
 * Everything is passed in, so it can be tested without speakers.
 */
const SAY_AGAIN_MS = 25000;

export function createDangerSound({ beep = makeBeep(), speak = makeSpeak(), clock = () => performance.now() } = {}) {
  let nextBeep = 0;
  let lastSaid = -Infinity;
  let wasNear = false;
  return {
    /** Call often (every frame is fine) with the visor's dangers ({ near, steep }). */
    update(dangers) {
      const t = clock();
      const near = dangers?.near;
      if (near && t >= nextBeep) {
        beep(near.distM < 4 ? 1320 : 990);
        nextBeep = t + Math.max(220, Math.min(1400, near.distM * 90));   // 15 m: every 1.4 s · 2 m: 4 a second
      }
      if (!near) nextBeep = 0;
      const steep = dangers?.steep;
      const ahead = steep && steep.startM >= 2 && steep.startM <= 20;
      if ((ahead || (near && !wasNear)) && t - lastSaid > SAY_AGAIN_MS) {
        lastSaid = t;
        speak(ahead
          ? `Steep slope ahead, ${Math.round(steep.startM)} metres`
          : 'No-go slope close by, watch your step');
      }
      wasNear = Boolean(near);
    },
  };
}

function makeBeep() {
  let ctx = null;
  return (freq) => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      o.stop(ctx.currentTime + 0.1);
    } catch { /* no audio: the glow still shows it */ }
  };
}

function makeSpeak() {
  return (text) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis?.speak(u);
    } catch { /* no speech: the visor still shows it */ }
  };
}

/** iPhone only speaks after a tap: call this inside the Start tap. */
export function unlockSpeech() {
  try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* fine */ }
}
