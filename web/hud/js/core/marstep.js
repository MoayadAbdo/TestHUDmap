/**
 * MarStep — one number, many answers.
 *
 * The MarStep model (core/energy.js) prices every step on Mars in joules: standing in the suit, walking on this
 * ground (THEMIS looseness + height-map bumpiness), and lifting the body uphill. Its headline number is the
 * MarStep margin:
 *
 *   MarStep ×n = O₂ left / (O₂ to walk home + 10 min reserve)        ×1 = turn back now
 *
 * The visor shows it as one easy number, the MarStep score (0–100):
 *
 *   MarStep score = 100 × (1 − 1 / margin)  = the share of your oxygen you can still spend before you must turn back
 *     100  a full tank, home is next door        33  (×1.5) time to head home soon
 *      50  (×2) half of what's left is free        0  (×1) head home now
 *
 * Everything below is read straight off the same numbers — no new sensors, no new data:
 *
 *   turn-back clock   minutes until ×1 at the effort right now       (spare O₂ ÷ burn rate now)
 *   linger time       minutes you can stand and work here            (spare O₂ ÷ burn rate standing)
 *   reach             metres you can still go out AND come back      (spare energy ÷ 2 × cost per metre here)
 *   terrain tax       how much more home costs than flat firm ground (E_home ÷ flat cost of the same route − 1)
 *   effort zone       REST / STEADY / HARD / PEAK against the NASA EMU design rates (293 W average, 469 W peak)
 *   next stop         the margin you'll have when you get to the next stop (GO / TIGHT / SKIP)
 *   consumables       what the walk has used: O₂ litres, CO₂ made, kcal, cooling water
 *
 * Constants:
 *   EMU design average 1000 Btu/h = 293 W for 7 h; peak 1600 Btu/h = 469 W for 15 min (NASA NTRS 20000081742)
 *   RQ 0.85: litres of CO₂ made per litre of O₂ at a mixed diet (the same diet that gives 20.1 kJ per litre O₂)
 *   cooling: 60–80 % of metabolic heat leaves through the water loop and sublimator (same source); we use 70 %,
 *            and ice sublimation takes 2.84 MJ per kg of water
 */
import { ENERGY } from './energy.js';

export const MARSTEP = {
  EMU_AVG_W: 293, EMU_PEAK_W: 469, PEAK_MIN: 15, REST_W: 200,
  RQ: 0.85, KJ_PER_KCAL: 4.184, COOLING_SHARE: 0.7, SUBLIMATION_MJ_PER_KG: 2.84,
  GO_MARGIN: 1.5,             // at the next stop: ≥ ×1.5 GO, ×1–1.5 TIGHT, < ×1 SKIP (same bands as the battery)
};

/** MarStep score 0–100 from the margin: % of the oxygen left that is free to spend (0 = turn back now). */
export function marstepScore(margin) {
  if (margin === Infinity) return 100;
  if (!Number.isFinite(margin) || margin <= 1) return 0;
  return Math.min(100, Math.max(0, Math.round(100 * (1 - 1 / margin))));
}

/** go / soon / home — the same bands as the battery colours: under ×1.5 (score 33) soon, under ×1 (score 0) home. */
export function marstepState({ margin, mustReturn = false, o2Pct = 100 }, m = MARSTEP) {
  if (mustReturn || o2Pct < 30 || (Number.isFinite(margin) && margin < 1)) return 'home';
  if (Number.isFinite(margin) && margin < m.GO_MARGIN) return 'soon';
  return 'go';
}

/** Effort zone from watts, against the suit's design rates. */
export function effortZone(watts, m = MARSTEP) {
  if (!Number.isFinite(watts)) return null;
  if (watts < m.REST_W) return { id: 'rest', label: 'REST' };
  if (watts <= m.EMU_AVG_W) return { id: 'steady', label: 'STEADY' };
  if (watts <= m.EMU_PEAK_W) return { id: 'hard', label: 'HARD' };
  return { id: 'peak', label: 'PEAK' };
}

/** Oxygen % above "home + reserve" (negative = already past the turn-back point). */
export const spareO2Pct = ({ o2Pct, homePct, reservePct }) => o2Pct - homePct - reservePct;

/**
 * Minutes until the margin reaches ×1 if you keep burning at `factor` × the suit's nominal rate where you stand.
 * (Walking away from base also makes home cost more, so while heading out the real time is a bit shorter.)
 */
export function minutesAtRate(spare, o2PctPerMin, factor) {
  if (spare <= 0) return 0;
  const rate = o2PctPerMin * Math.max(0.01, factor);
  return spare / rate;
}

/** Metres you can still go out and come back from here: half the spare energy, at the cost per metre here. */
export function reachM(spareJ, joulesPerM) {
  if (!(spareJ > 0) || !(joulesPerM > 0)) return 0;
  return spareJ / (2 * joulesPerM);
}

/** How much more the walk home costs than flat firm ground along the same route (0.38 = +38 %). */
export function terrainTax(homeJ, routeM, k = ENERGY) {
  if (!(routeM > 1) || !Number.isFinite(homeJ)) return null;
  const flat = (k.P0 * routeM) / k.V0;
  return Math.max(0, homeJ / flat - 1);
}

/** The MarStep margin you'll have on arrival at the next stop, and what to do about it. */
export function nextStopCheck({ o2Pct, toStopPct, stopHomePct, reservePct }, m = MARSTEP) {
  const need = stopHomePct + reservePct;
  const margin = need > 0 ? (o2Pct - toStopPct) / need : Infinity;
  const call = margin < 1 ? 'SKIP' : margin < m.GO_MARGIN ? 'TIGHT' : 'GO';
  return { margin, call, score: marstepScore(margin) };
}

/** What a walk that used `joules` has cost the suit and the body. */
export function consumables(joules, k = ENERGY, m = MARSTEP) {
  const j = Math.max(0, joules);
  const o2L = j / (k.KJ_PER_L * 1000);
  return {
    o2L,
    co2L: o2L * m.RQ,
    kcal: j / (m.KJ_PER_KCAL * 1000),
    coolingWaterL: (j * m.COOLING_SHARE) / (m.SUBLIMATION_MJ_PER_KG * 1e6),   // 1 kg water ≈ 1 L
  };
}

/** Peak timer: how long the astronaut has been above the suit's design peak (minutes, decays when resting). */
export function createPeakTimer(m = MARSTEP) {
  let min = 0;
  return {
    update(watts, dtMs) {
      if (!(dtMs > 0) || dtMs > 5000) return min;
      const dMin = dtMs / 60000;
      min = watts > m.EMU_PEAK_W ? min + dMin : Math.max(0, min - dMin);
      return min;
    },
    get minutes() { return min; },
  };
}

const round = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/**
 * Everything MarStep tells you, from one energy readout.
 *   energy: createEnergyModel().readout(...)  { effortW, homeKJ, homePct, reservePct, margin }
 *   model:  the energy model (for pctPerJoule, joulesPerM, spentJ)
 *   routeM: walk home along the route (Mars metres); next: { toStopPct, stopHomePct } or null
 */
export function marstepInsights({ energy, model, o2Pct, o2PctPerMin, routeM = null, next = null, peakMin = 0 }, k = ENERGY) {
  if (!energy) return null;
  const spare = spareO2Pct({ o2Pct, homePct: energy.homePct, reservePct: energy.reservePct });
  const factor = energy.effortW / k.P0;
  const spareJ = spare / model.pctPerJoule;
  const used = consumables(model.spentJ, k);
  const nextCheck = next ? nextStopCheck({ o2Pct, reservePct: energy.reservePct, ...next }) : null;
  return {
    margin: energy.margin,
    score: marstepScore(energy.margin),
    zone: effortZone(energy.effortW),
    turnBackMin: round(minutesAtRate(spare, o2PctPerMin, Math.max(1, factor))),   // assumes you keep walking: steady, never optimistic
    lingerMin: round(minutesAtRate(spare, o2PctPerMin, k.P_STAND / k.P0)),
    reachM: round(reachM(spareJ, model.joulesPerM), -1),
    terrainTax: round(terrainTax(energy.homeJ ?? energy.homeKJ * 1000, routeM), 2),
    peakMin: round(peakMin, 1),
    next: nextCheck ? { margin: round(nextCheck.margin, 1), call: nextCheck.call, score: nextCheck.score } : null,
    used: { o2L: round(used.o2L, 1), co2L: round(used.co2L, 1), kcal: round(used.kcal), coolingWaterL: round(used.coolingWaterL, 2) },
  };
}
