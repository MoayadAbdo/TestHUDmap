/**
 * Suit energy model: how hard the astronaut is working on THIS ground, and the oxygen it takes to walk home.
 *
 *   P = P_stand + η · (P0 − P_stand) · v / v0  +  m·g·v·sinθ / ε        (watts)
 *
 *   P0 = 272 W       suited walking on flat firm ground at v0 (Apollo lunar EVA average, 234 kcal/h)
 *   P_stand = 150 W  standing still in the suit
 *   m = 180 kg       astronaut + suit (assumed), g = 3.71 m/s² (Mars)
 *   ε = 0.25 uphill  (muscle efficiency for positive work); downhill |lift| / 1.2 (braking costs a little, never saves)
 *   η                how hard the ground is to walk on, from our layers (Pandolf terrain factor: 1.0 road … 2.1 loose sand)
 *                    η = 1 + 0.5 · clip((420 − TI) / 70) + 0.4 · clip(rough / 0.5 m)
 *                    TI = THEMIS thermal inertia (low = loose), rough = DEM bumpiness (core/terrain-grid.js)
 *
 *   Energy for a step:   dE = P · ds / v
 *   Energy to home:      E_home(x) = cheapest Σ dE back to base, ground over 20° blocked (Dijkstra over the DEM)
 *   Oxygen:              1 L O₂ ≈ 20.1 kJ;  tank drain = suit %/min × P / P0  (the suit's rate is the flat-ground rate)
 *   Return Energy Margin REM = O₂ left / (O₂ to walk home + 10 min reserve) — turn back when it drops under 1.
 */
export const ENERGY = {
  P0: 272, P_STAND: 150, V0: 0.8, MASS: 180, G: 3.71, EFF_UP: 0.25, EFF_DOWN: 1.2,
  KJ_PER_L: 20.1, V_MAX: 1.0, NOGO_DEG: 20, TI_FIRM: 420, TI_SPAN: 70, LOOSE_ADD: 0.5, ROUGH_ADD: 0.4, ROUGH_M: 0.5, ETA_MAX: 2.1,
};

const clip01 = (x) => Math.min(1, Math.max(0, x));

/** η for one cell. ti = THEMIS thermal inertia (null = unknown, treated as firm), rough in metres. */
export function terrainFactor(ti, rough = 0, k = ENERGY) {
  const loose = Number.isFinite(ti) ? clip01((k.TI_FIRM - ti) / k.TI_SPAN) * k.LOOSE_ADD : 0;
  return Math.min(k.ETA_MAX, 1 + loose + clip01(rough / k.ROUGH_M) * k.ROUGH_ADD);
}

/** Metabolic power (W) at speed v (m/s) on grade sinθ (+ uphill) and terrain factor η. */
export function powerW(v, sinT = 0, eta = 1, k = ENERGY) {
  const speed = Math.min(k.V_MAX, Math.max(0, v));          // demo speed-ups (?speed=, Shift) don't make the body work harder
  const lift = k.MASS * k.G * speed * sinT;
  return k.P_STAND + eta * (k.P0 - k.P_STAND) * (speed / k.V0) + (lift > 0 ? lift / k.EFF_UP : -lift / k.EFF_DOWN);
}

/** Litres of O₂ for an energy in joules. */
export const litresO2 = (joules, k = ENERGY) => joules / (k.KJ_PER_L * 1000);

/** Return Energy Margin: ≥ 1 means enough oxygen to walk home with the reserve left. */
export function returnMargin(o2Pct, homePct, reservePct) {
  const need = homePct + reservePct;
  return need > 0 ? o2Pct / need : Infinity;
}

/** Small binary heap of [cost, cell]. */
function minHeap() {
  const c = [];
  const k = [];
  const swap = (a, b) => { [c[a], c[b]] = [c[b], c[a]]; [k[a], k[b]] = [k[b], k[a]]; };
  return {
    get size() { return c.length; },
    push(cost, cell) {
      c.push(cost); k.push(cell);
      let i = c.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (c[p] <= c[i]) break; swap(p, i); i = p; }
    },
    pop() {
      const out = [c[0], k[0]];
      const lc = c.pop(); const lk = k.pop();
      if (c.length) {
        c[0] = lc; k[0] = lk;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1; const r = l + 1; let m = i;
          if (l < c.length && c[l] < c[m]) m = l;
          if (r < c.length && c[r] < c[m]) m = r;
          if (m === i) break;
          swap(m, i); i = m;
        }
      }
      return out;
    },
  };
}

/**
 * Joules to walk home from every cell (Float64Array, Infinity = no safe way home).
 * grid: createTerrainGrid(...) (gw, gh, cellX, cellY, slope, rough); heights: the same grid's heights; eta: per-cell η.
 */
export function energyHomeGrid({ gw, gh, cellX, cellY, slope }, heights, eta, baseCell, k = ENERGY) {
  const E = new Float64Array(gw * gh).fill(Infinity);     // 64-bit: a float32 store would round below the heap key
  if (baseCell == null) return E;
  E[baseCell] = 0;
  const pq = minHeap();
  pq.push(0, baseCell);
  const steps = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  while (pq.size) {
    const [e, cell] = pq.pop();
    if (e > E[cell]) continue;
    const j = Math.floor(cell / gw);
    const i = cell % gw;
    for (const [dj, di] of steps) {
      const a = j + dj; const b = i + di;
      if (a < 0 || b < 0 || a >= gh || b >= gw) continue;
      const from = a * gw + b;                         // the astronaut stands here and steps toward `cell`
      if (slope[from] > k.NOGO_DEG) continue;
      const ds = Math.hypot(dj * cellY, di * cellX);
      const dh = heights[cell] - heights[from];
      const len = Math.hypot(ds, dh);
      const w = (powerW(k.V0, dh / len, (eta[from] + eta[cell]) / 2, k) * len) / k.V0;
      if (e + w < E[from]) { E[from] = e + w; pq.push(e + w, from); }
    }
  }
  return E;
}

/**
 * The model the HUD uses. grid + heights may be null (no height map): then the walk home is costed as flat firm
 * ground along homeM. thermal (per-cell TI) can arrive later with setThermal().
 */
export function createEnergyModel({ grid = null, heights = null, baseMars = null, o2PctPerMin = 0.25, reserveMin = 10, k = ENERGY }) {
  let eta = null;
  let home = null;
  let thermal = null;
  const pctPerJoule = o2PctPerMin / (k.P0 * 60);         // calibrated: the suit's rate = flat firm walking at v0
  let effort = k.P0;                                     // smoothed watts

  function build() {
    if (!grid || !heights) return;
    eta = new Float32Array(grid.gw * grid.gh);
    for (let c = 0; c < eta.length; c++) eta[c] = terrainFactor(thermal ? thermal[c] : null, grid.rough[c], k);
    home = null;                                         // re-run lazily
  }
  build();

  function cellOf(mars) {
    return grid && mars ? grid.cellOf(mars) : null;
  }

  return {
    /** η under the astronaut (1 when unknown). */
    etaAt(mars) {
      const c = cellOf(mars);
      return c == null || !eta ? 1 : eta[c];
    },
    setThermal(ti) {
      thermal = ti;
      build();
    },
    /** Update the effort from the walk: speed (m/s) and grade (sinθ, + uphill). Returns smoothed watts. */
    update({ speedMps, sinT = 0, mars }, dtMs = 250) {
      const target = powerW(speedMps, sinT, this.etaAt(mars), k);
      effort += (1 - Math.exp(-dtMs / 4000)) * (target - effort);     // ~4 s smoothing: breathing, not footsteps
      return effort;
    },
    get effortW() { return effort; },
    /** How many times the suit's nominal rate the astronaut is burning oxygen now. */
    get effortFactor() { return effort / k.P0; },
    /** Joules to walk home from here; fallbackM = walk home in Mars metres when off the map. */
    homeJoules(mars, fallbackM = 0) {
      const c = cellOf(mars);
      if (c != null && eta) {
        if (!home) home = energyHomeGrid(grid, heights, eta, cellOf(baseMars), k);
        if (Number.isFinite(home[c])) return home[c];
      }
      return (powerW(k.V0, 0, 1.25, k) * fallbackM) / k.V0;            // average ground here: η ≈ 1.25
    },
    homePct(mars, fallbackM) { return this.homeJoules(mars, fallbackM) * pctPerJoule; },
    get reservePct() { return reserveMin * o2PctPerMin; },
    /** Everything the visor / telemetry show. */
    readout({ o2Pct, mars, fallbackM }) {
      const homeJ = this.homeJoules(mars, fallbackM);
      const homePct = homeJ * pctPerJoule;
      return {
        effortW: Math.round(effort),
        homeKJ: Math.round(homeJ / 1000),
        homeO2L: Math.round(litresO2(homeJ, k) * 10) / 10,
        homePct,
        reservePct: this.reservePct,
        margin: returnMargin(o2Pct, homePct, this.reservePct),
      };
    },
  };
}
