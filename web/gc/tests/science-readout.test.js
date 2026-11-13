import assert from "node:assert/strict";
import { test } from "node:test";
import { createSampleLog, createScienceReadout, sampleLine, scienceText } from "../science-readout.js";

const ridge = { id: 2, name: "Steep ridge", how: "scan", t: 1731500000000 };
const hollow = { id: 3, name: "Hollow", how: "photo", t: 1731500100000 };

test("tile: — until the phone sends science, then done/total and the last name", () => {
  assert.deepEqual(scienceText(undefined), { value: "—", last: "" });
  assert.deepEqual(scienceText({ done: 2, total: 5, last: "Steep ridge" }), { value: "2/5", last: "Steep ridge" });
  assert.deepEqual(scienceText({ done: 0, total: 5, last: null }), { value: "0/5", last: "" });
  assert.deepEqual(scienceText({ done: "2", total: 5 }), { value: "—", last: "" });
});

test("each sample is new once, even when the phone sends the list again", () => {
  const fresh = createSampleLog();
  assert.deepEqual(fresh([ridge]), [ridge]);
  assert.deepEqual(fresh([ridge]), []);
  assert.deepEqual(fresh([ridge, hollow]), [hollow]);
  assert.deepEqual(fresh([{ ...ridge, t: ridge.t + 1 }]).length, 1, "the same stop again after a reset is new");
  assert.deepEqual(fresh(undefined), []);
  assert.deepEqual(fresh([null, "x", 3]), []);
});

test("log line", () => {
  assert.equal(sampleLine(ridge), "SAMPLE logged: Steep ridge (scan)");
  assert.equal(sampleLine({ id: 4 }), "SAMPLE logged: stop 4");
});

test("readout: fills the tile and logs each new sample once, as science", () => {
  const value = {}, last = {}, lines = [];
  const readout = createScienceReadout({ value, last, log: (text, kind) => lines.push([text, kind]) });
  readout.update({ o2_pct: 90 });
  assert.equal(value.textContent, "—");
  const t = { science: { done: 1, total: 5, last: "Steep ridge" }, samples: [ridge] };
  readout.update(t);
  readout.update(t);
  assert.equal(value.textContent, "1/5");
  assert.equal(last.textContent, "Steep ridge");
  assert.deepEqual(lines, [["SAMPLE logged: Steep ridge (scan)", "science"]]);
});
