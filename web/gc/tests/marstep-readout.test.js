import test from "node:test";
import assert from "node:assert/strict";
import { marstepTiles } from "../marstep-readout.js";

test("no telemetry yet: dashes, no crash", () => {
  const t = marstepTiles(null);
  assert.equal(t.msMargin.text, "—");
  assert.equal(t.msNext.text, "—");
});

test("MarStep tiles read the HUD's numbers and colour the risky ones", () => {
  const t = marstepTiles({
    return_margin: 1.3, o2_home_pct: 12.4, effort_w: 520,
    marstep: {
      turn_back_min: 14, linger_min: 31, reach_m: 1240, zone: "PEAK", terrain_tax: 0.27, peak_min: 2.5,
      next: { call: "SKIP", margin: 0.8 }, used: { o2L: 12.3, co2L: 10.5, kcal: 59, coolingWaterL: 0.25 },
    },
  });
  assert.deepEqual([t.msMargin.text, t.msMargin.cls], ["×1.3", "warn"]);
  assert.deepEqual([t.msTurn.text, t.msTurn.note, t.msTurn.cls], ["0h 14m", "standing: 0h 31m", "warn"]);
  assert.equal(t.msReach.text, "1.2 km");
  assert.equal(t.msReach.note, "terrain +27% on the way home");
  assert.deepEqual([t.msEffort.note, t.msEffort.cls], ["PEAK · 2.5 min over peak", "bad"]);
  assert.deepEqual([t.msNext.text, t.msNext.cls], ["SKIP ×0.8", "bad"]);
  assert.equal(t.msUsed.note, "10.5 L CO₂ · 59 kcal · 0.25 L water");
});

test("past the turn-back point reads NOW in red", () => {
  const t = marstepTiles({ return_margin: 0.9, marstep: { turn_back_min: 0, zone: "STEADY" } });
  assert.deepEqual([t.msTurn.text, t.msTurn.cls, t.msMargin.cls], ["NOW", "bad", "bad"]);
});
