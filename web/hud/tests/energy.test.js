import test from 'node:test';
import assert from 'node:assert/strict';
import { ENERGY, createEnergyModel, energyHomeGrid, litresO2, powerW, returnMargin, terrainFactor } from '../js/core/energy.js';
import { createTerrainGrid } from '../js/core/terrain-grid.js';
import { evaluateAlerts } from '../js/core/alerts.js';
import { createSuit } from '../js/core/suit.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('flat firm ground at walking pace costs P0; standing still costs less', () => {
  near(powerW(ENERGY.V0, 0, 1), ENERGY.P0);
  near(powerW(0, 0, 1), ENERGY.P_STAND);
});

test('uphill costs lift / 0.25, downhill only a little braking, loose ground more', () => {
  const sin10 = Math.sin(Math.atan(0.1));
  const lift = ENERGY.MASS * ENERGY.G * ENERGY.V0 * sin10;
  near(powerW(ENERGY.V0, sin10, 1), ENERGY.P0 + lift / 0.25);
  near(powerW(ENERGY.V0, -sin10, 1), ENERGY.P0 + lift / 1.2);
  assert.ok(powerW(ENERGY.V0, 0, 1.5) > powerW(ENERGY.V0, 0, 1));
});

test('η: firm smooth ground is 1, loosest THEMIS + very rough ground tops out at 1.9, never above 2.1', () => {
  near(terrainFactor(450, 0), 1);
  near(terrainFactor(null, 0), 1);
  near(terrainFactor(350, 1), 1.9);
  assert.ok(terrainFactor(0, 99) <= 2.1);
});

test('oxygen: 20.1 kJ per litre; margin = O2 left / (home + reserve)', () => {
  near(litresO2(20100), 1);
  near(returnMargin(50, 15, 10), 2);
  assert.equal(returnMargin(50, 0, 0), Infinity);
});

/** gw × gh grid, 1 m cells, heights from f(i, j). */
function gridOf(gw, gh, f) {
  const heights = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) heights[j * gw + i] = f(i, j);
  const terrain = { heights, grid: [gw, gh], bounds: { north: 1, south: 0, west: 0, east: 1 }, width_m: gw - 1, height_m: gh - 1 };
  return { grid: createTerrainGrid(terrain), heights };
}

test('energy home on flat ground = P0 × distance / v0, and walking uphill home costs more than downhill', () => {
  const { grid, heights } = gridOf(11, 11, () => 0);
  const eta = new Float32Array(121).fill(1);
  const E = energyHomeGrid(grid, heights, eta, 5 * 11 + 0);           // base: west edge, middle row
  near(E[5 * 11 + 10], (ENERGY.P0 * 10) / ENERGY.V0, 1e-2);

  const ramp = gridOf(11, 11, (i) => -0.1 * i);                       // base high in the west: going home is uphill
  const Er = energyHomeGrid(ramp.grid, ramp.heights, eta, 5 * 11 + 0);
  const back = gridOf(11, 11, (i) => 0.1 * i);                        // base low: going home is downhill
  const Eb = energyHomeGrid(back.grid, back.heights, eta, 5 * 11 + 0);
  assert.ok(Er[5 * 11 + 10] > Eb[5 * 11 + 10]);
  assert.ok(Eb[5 * 11 + 10] > E[5 * 11 + 10]);                        // braking is never free
});

test('no-go ground (over 20°) is walked around: the detour costs more than the straight line', () => {
  const { grid, heights } = gridOf(9, 9, (i, j) => (i === 4 && j >= 3 ? 10 : 0));   // a wall, with a gap in the north
  const eta = new Float32Array(81).fill(1);
  const E = energyHomeGrid(grid, heights, eta, 8 * 9 + 0);            // base: south-west corner
  assert.ok(Number.isFinite(E[8 * 9 + 8]));
  assert.ok(E[8 * 9 + 8] > (ENERGY.P0 * 8 * 1.5) / ENERGY.V0);        // has to go up and around the wall
});

test('model: loose ground raises the effort and the suit burns oxygen faster', () => {
  const { grid, heights } = gridOf(11, 11, () => 0);
  const model = createEnergyModel({ grid, heights, baseMars: [0.5, 0], o2PctPerMin: 0.25 });
  const firm = model.update({ speedMps: 0.8, sinT: 0, mars: [0.5, 0.5] }, 60000);
  near(firm, ENERGY.P0, 1);
  model.setThermal(new Float32Array(121).fill(350));
  const loose = model.update({ speedMps: 0.8, sinT: 0, mars: [0.5, 0.5] }, 60000);
  assert.ok(loose > firm * 1.15);                                      // η 1.5 on the loosest THEMIS ground

  const suit = createSuit({ o2PctPerMin: 0.25, startMs: 0 });
  suit.setEffort(model.effortFactor);
  suit.update(60000);
  assert.ok(100 - suit.o2Pct > 0.25 * 1.15);
});

test('readout: oxygen to walk home, reserve and margin', () => {
  const { grid, heights } = gridOf(11, 11, () => 0);
  const model = createEnergyModel({ grid, heights, baseMars: [0.5, 0], o2PctPerMin: 0.25, reserveMin: 10 });
  const r = model.readout({ o2Pct: 50, mars: [0.5, 1] });             // 10 m from base on flat firm ground
  near(r.homePct, ((10 / ENERGY.V0) / 60) * 0.25, 1e-4);              // = the suit's rate for the walking time
  near(r.reservePct, 2.5);
  near(r.margin, 50 / (r.homePct + 2.5), 1e-6);
});

test('alerts: the energy margin decides when to head home', () => {
  const base = { slopeAheadDeg: 0, o2Pct: 60, o2MinutesLeft: 200, walkBackMinutes: 5, alreadyReturning: false };
  assert.equal(evaluateAlerts({ ...base, returnMargin: 1.4 }).mustReturn, false);
  const r = evaluateAlerts({ ...base, returnMargin: 0.9 });
  assert.equal(r.mustReturn, true);
  assert.equal(r.reason, 'reserve');
  assert.equal(evaluateAlerts(base).mustReturn, false);              // no margin: the old time check
});
