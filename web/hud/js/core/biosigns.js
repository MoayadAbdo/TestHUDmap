/**
 * Simulated heart and breathing rates (the suit has no real sensors).
 * They rise with walking speed, steep ground and low oxygen, and change smoothly.
 */
export function createBiosigns({ restHeart = 72, restBreaths = 14, smoothing = 0.08 } = {}) {
  let heart = restHeart;
  let breaths = restBreaths;
  return {
    update({ speedMps = 0, slopeDeg = 0, lowOxygen = false }) {
      // a steady 0.8 m/s walk in 0.38 g adds ~15 bpm; steep ground and low oxygen add more
      const effort = Math.min(speedMps, 1.5) * 18 + Math.min(slopeDeg, 30) * 0.7 + (lowOxygen ? 10 : 0);
      heart += smoothing * (restHeart + effort - heart);
      breaths += smoothing * (restBreaths + effort * 0.22 - breaths);
      return { heartBpm: Math.round(heart), breathsPerMin: Math.round(breaths) };
    },
  };
}
