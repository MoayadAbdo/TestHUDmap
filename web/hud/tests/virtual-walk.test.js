import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVirtualWalk } from '../js/sources/virtual-walk.js';
import { distanceM } from '../js/core/geo.js';

const field = (at = [10, 20], heading = 0) => ({ frame: 'field', getPosition: () => ({ at, heading, pitch: 0, hasHeading: true }) });

test('camera mode drives like the sim: W walks forward along the heading, on top of GPS', () => {
  let t = 0;
  const w = createVirtualWalk(field([10, 20], 90), { walkMps: 1, speed: 1, clock: () => t });
  w.getPosition();
  w.setMoveInput({ forward: 1 });
  for (t = 0; t <= 10000; t += 100) w.getPosition();
  const p = w.getPosition();
  assert.ok(Math.abs(distanceM([10, 20], p.at, 6371000) - 10) < 0.5, 'about 10 m in 10 s');
  assert.ok(p.at[1] > 20 && Math.abs(p.at[0] - 10) < 1e-6, 'heading 90: east');
});

test('Q / E turn the view, and "Next stop" puts you on the stop', () => {
  let t = 0;
  const w = createVirtualWalk(field([10, 20], 0), { clock: () => t });
  w.getPosition();
  w.setMoveInput({ turn: 1 });
  t = 1000; w.getPosition();
  assert.ok(Math.abs(w.getPosition().heading - 90) < 1);
  w.jumpTo([10.001, 20.001]);
  const p = w.getPosition();
  assert.ok(distanceM(p.at, [10.001, 20.001], 6371000) < 0.5);
});
