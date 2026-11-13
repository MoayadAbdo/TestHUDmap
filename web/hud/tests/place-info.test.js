import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { placeInfo, cellIndex } from '../js/core/place-info.js';

const grid = JSON.parse(fs.readFileSync(new URL('../../mission/knowledge/grid.json', import.meta.url)));
const mission = JSON.parse(fs.readFileSync(new URL('../../mission/mission.json', import.meta.url)));
const facts = JSON.parse(fs.readFileSync(new URL('../../mission/knowledge/facts.json', import.meta.url)));
const at = (id) => mission.stops.find((s) => s.id === id).mars;

test('outside the mapped area gives null', () => {
  assert.equal(cellIndex(grid, 0, 0), -1);
  assert.equal(placeInfo({ grid, mission, lat: 0, lon: 0 }), null);
});

test('different stops give different facts (the steep ridge is steep)', () => {
  const ridge = placeInfo({ grid, mission, lat: at(2)[0], lon: at(2)[1] });
  const base = placeInfo({ grid, mission, lat: at(0)[0], lon: at(0)[1] });
  assert.ok(ridge.here.steep_pct > base.here.steep_pct);
  assert.match(ridge.lines.find((l) => l.kind === 'slope').text, /steep|broken/i);
  assert.equal(ridge.stop.name, 'Steep ridge');
});

test('mineral lines stay honest: a hint, not a confirmation', () => {
  for (const s of mission.stops) {
    const t = placeInfo({ grid, mission, lat: s.mars[0], lon: s.mars[1] }).lines.find((l) => l.kind === 'mineral').text;
    assert.ok(/hints at|No clear/.test(t), t);
  }
});

test('near a stop: Curiosity fact, look-for tip and its source', () => {
  const p = placeInfo({ grid, mission, facts, lat: at(3)[0], lon: at(3)[1] });
  assert.match(p.lines.find((l) => l.kind === 'look_for').text, /nodules/);
  assert.ok(p.sources.some((s) => /NASA\/JPL/.test(s)));
});

test('between stops: one general boxwork fact', () => {
  const [a, b] = [at(0), at(1)];
  const p = placeInfo({ grid, mission, facts, lat: (a[0] + b[0]) / 2, lon: (a[1] + b[1]) / 2 });
  assert.equal(p.stop, null);
  assert.equal(p.lines.filter((l) => l.kind === 'area').length, 1);
});

test('every stop has a fact with a known source', () => {
  for (const s of mission.stops) {
    const f = facts.stops.find((x) => x.id === s.id);
    assert.ok(f && f.curiosity && f.look_for && facts.sources[f.source], `stop ${s.id}`);
  }
});
