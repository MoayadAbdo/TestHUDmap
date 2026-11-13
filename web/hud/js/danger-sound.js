/**
 * Danger you can hear near no-go ground (no reading needed in the VR box): a parking-sensor beep that speeds up as
 * it gets closer, and a recorded warning line. beep(freq) and say(clipId) are passed in, so it can be tested.
 */
const SAY_AGAIN_MS = 25000;

export function createDangerSound({ beep, say, clock = () => performance.now() }) {
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
        say(ahead ? 'slope_ahead' : 'slope_close');
      }
      wasNear = Boolean(near);
    },
  };
}

/** A short beep on the shared audio channel. */
export function makeBeep(getCtx) {
  return (freq) => {
    try {
      const ctx = getCtx();
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
