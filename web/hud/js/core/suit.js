/** Pretend oxygen tank and battery. speed > 1 makes them drain faster for demos; effort follows the ground. */
export function createSuit({ o2StartPct = 100, o2PctPerMin = 0.25, powerPctPerMin = 0.2, startMs = 0 }) {
  let o2 = o2StartPct;
  let power = 100;
  let lastMs = startMs;
  let speed = 1;
  let effort = 1;                 // × the nominal rate: harder walking burns more oxygen (core/energy.js)

  return {
    update(nowMs) {
      const minutes = (nowMs - lastMs) / 60000;
      lastMs = nowMs;
      o2 = Math.max(0, o2 - o2PctPerMin * speed * effort * minutes);
      power = Math.max(0, power - powerPctPerMin * speed * minutes);
      return o2;
    },
    get o2Pct() {
      return o2;
    },
    get powerPct() {
      return power;
    },
    get minutesLeft() {
      return o2 / (o2PctPerMin * speed * effort);
    },
    setSpeed(value) {
      speed = value;
    },
    /** Oxygen burn as a multiple of the suit's nominal (flat firm walking) rate. */
    setEffort(factor) {
      effort = Number.isFinite(factor) && factor > 0 ? factor : 1;
    },
    get effort() {
      return effort;
    },
    setO2(pct) {
      o2 = pct;
    },
  };
}
