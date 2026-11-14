import test from 'node:test';
import assert from 'node:assert/strict';
import { ENERGY, createEnergyModel } from '../js/core/energy.js';
import {
  MARSTEP, consumables, createPeakTimer, effortZone, marstepInsights, minutesAtRate, nextStopCheck, reachM, terrainTax,
} from '../js/core/marstep.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('effort zones follow the EMU design rates (293 W average, 469 W peak)', () => {
  assert.equal(effortZone(150).label, 'REST');
  assert.equal(effortZone(272).label, 'STEADY');
  assert.equal(effortZone(293).label, 'STEADY');
  assert.equal(effortZone(400).label, 'HARD');
  assert.equal(effortZone(643).label, 'PEAK');
  assert.equal(effortZone(NaN), null);
});

test('turn-back clock: spare oxygen ÷ burn rate; standing lasts longer than climbing; past the point = 0', () => {
  near(minutesAtRate(20, 0.25, 1), 80);                    // 20 % spare at the nominal rate
  near(minutesAtRate(20, 0.25, 2), 40);                    // working twice as hard halves it
  assert.ok(minutesAtRate(20, 0.25, ENERGY.P_STAND / ENERGY.P0) > 80);
  assert.equal(minutesAtRate(-3, 0.25, 1), 0);
});

test('reach: out and back, so half the spare energy', () => {
  near(reachM(340000, 340), 500);
  assert.equal(reachM(-1, 340), 0);
});

test('terrain tax: 0 on flat firm ground, +x on harder ground', () => {
  const flat = (ENERGY.P0 * 100) / ENERGY.V0;
  near(terrainTax(flat, 100), 0);
  near(terrainTax(flat * 1.38, 100), 0.38);
  assert.equal(terrainTax(1000, 0), null);
});

test('next stop: GO / TIGHT / SKIP from the margin on arrival', () => {
  assert.equal(nextStopCheck({ o2Pct: 60, toStopPct: 5, stopHomePct: 10, reservePct: 2.5 }).call, 'GO');
  assert.equal(nextStopCheck({ o2Pct: 20, toStopPct: 5, stopHomePct: 8, reservePct: 2.5 }).call, 'TIGHT');
  const skip = nextStopCheck({ o2Pct: 12, toStopPct: 5, stopHomePct: 8, reservePct: 2.5 });
  assert.equal(skip.call, 'SKIP');
  assert.ok(skip.margin < 1);
  assert.equal(MARSTEP.GO_MARGIN, 1.5);
});

test('consumables: 20.1 kJ per litre O₂, RQ 0.85, kcal, cooling water', () => {
  const c = consumables(201000);                           // 201 kJ
  near(c.o2L, 10);
  near(c.co2L, 8.5);
  near(c.kcal, 201000 / 4184);
  near(c.coolingWaterL, (201000 * 0.7) / 2.84e6);
  assert.equal(consumables(-5).o2L, 0);
});

test('peak timer counts minutes above 469 W and winds down when easier', () => {
  const p = createPeakTimer();
  for (let i = 0; i < 240; i++) p.update(600, 250);        // 1 min at peak
  near(p.minutes, 1, 1e-9);
  for (let i = 0; i < 120; i++) p.update(250, 250);        // 30 s easy
  near(p.minutes, 0.5, 1e-9);
  p.update(600, 60000);                                    // a paused tab is not work
  near(p.minutes, 0.5, 1e-9);
});

test('insights from a live model hang together', () => {
  const model = createEnergyModel({ o2PctPerMin: 0.25, reserveMin: 10 });
  for (let i = 0; i < 400; i++) model.update({ speedMps: ENERGY.V0, sinT: 0 }, 250);   // 100 s of flat walking
  near(model.spentJ, ENERGY.P0 * 100, ENERGY.P0 * 5);    // smoothing starts at P0, so ≈ 272 W × 100 s
  const energy = model.readout({ o2Pct: 50, mars: null, fallbackM: 200 });
  const m = marstepInsights({ energy, model, o2Pct: 50, o2PctPerMin: 0.25, routeM: 200, next: { toStopPct: 1, stopHomePct: 2 } });
  assert.equal(m.zone.label, 'STEADY');
  assert.ok(m.turnBackMin > 0 && m.lingerMin > m.turnBackMin);
  assert.ok(m.reachM > 0);
  near(m.terrainTax, 0.11, 0.006);                         // off the map, home is costed as average ground: η 1.25 on the walking part → +11 %
  assert.equal(m.next.call, 'GO');
  assert.ok(m.used.o2L > 1);
});

test('trip to the next stop costs more when it is uphill', () => {
  const heights = new Float32Array([0, 10]);
  const grid = { gw: 2, gh: 1, cellX: 1, cellY: 1, slope: new Float32Array(2), rough: new Float32Array(2), cellOf: ([lat]) => (lat > 0.5 ? 1 : 0) };
  const model = createEnergyModel({ grid, heights, baseMars: [0, 0] });
  const up = model.tripJoules([0, 0], [1, 0], 100);
  const down = model.tripJoules([1, 0], [0, 0], 100);
  near(up - down, (ENERGY.MASS * ENERGY.G * 10) / ENERGY.EFF_UP);
});
