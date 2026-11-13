import assert from "node:assert/strict";
import { test } from "node:test";
import { stopLabel } from "../map-layers.js";

test("stop label shows what the layers say at the stop", () => {
  const layers = [
    { id: "slope", stops: [{ id: 2, slope_deg: 22.2 }] },
    { id: "thermal", stops: [{ id: 2, thermal_inertia: 396 }] },
  ];
  assert.equal(stopLabel({ id: 2, name: "Steep ridge" }, layers), "2 · Steep ridge · slope 22° · TI 396");
  assert.equal(stopLabel({ id: 9, name: "X" }, layers), "9 · X");
});
