import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectGround, horizonRow } from '../js/core/ar.js';
import { cameraPitch } from '../js/core/compass.js';
import { EARTH_RADIUS_M as R, distanceM, fromOffset, offsetM } from '../js/core/geo.js';
import { createRoutePlanner, pathGuide, pathLength, pointAlong } from '../js/core/path.js';

const O = [0, 0];
const at = (east, north) => fromOffset(O, { east, north }, R);
// an L-shaped route: 100 m north, then 100 m east (a straight line would cut the corner)
const route = [at(0, 0), at(0, 50), at(0, 100), at(50, 100), at(100, 100)].map((p, i) => ({ at: p, slope_deg: i === 3 ? 15 : 3 }));
const planner = createRoutePlanner({ route, r: R });
const near = (a, b, m = 1) => assert.ok(distanceM(a, b, R) <= m, `${JSON.stringify(offsetM(O, a, R))} not near ${JSON.stringify(offsetM(O, b, R))}`);

test('the path follows the route around the corner, not the straight line', () => {
  const path = planner.plan(at(0, 10), at(100, 100));
  near(path.at(-1), at(100, 100));
  assert.ok(path.some((p) => distanceM(p, at(0, 100), R) < 1), 'goes through the corner');
  assert.ok(Math.abs(pathLength(path, R) - 190) < 2, `length ${pathLength(path, R)}`);
});

test('off the route: first back to it, then along it', () => {
  const path = planner.plan(at(30, 40), at(0, 100));
  near(path[1], at(0, 40));
  assert.ok(Math.abs(pathLength(path, R) - 90) < 2);
});

test('going back towards base walks the route backwards', () => {
  const path = planner.plan(at(100, 100), at(0, 0));
  assert.ok(path.some((p) => distanceM(p, at(0, 100), R) < 1));
  near(path.at(-1), at(0, 0));
});

test('pointAlong and the guide: where to head now is 10 m along the path', () => {
  const path = planner.plan(at(0, 95), at(100, 100));
  near(pointAlong(path, 10, R), at(5, 100));
  const g = pathGuide(path, R);
  near(g.toward, at(5, 100));
  assert.equal(g.samples[0].d, 0);
  assert.ok(planner.slopeAt(at(70, 100)) === 15, 'steep part of the route');
});

test('head tilt: level = old projection; looking up moves the ground and horizon down the screen', () => {
  const view = { centerX: 400, centerY: 300, focalPx: 500 };
  const level = projectGround({ forward: 10, right: 0 }, view);
  assert.equal(level.y, 300 + (500 * 1.6) / 10);
  const up = projectGround({ forward: 10, right: 0 }, { ...view, pitchDeg: 10 });
  assert.ok(up.y > level.y);
  assert.ok(horizonRow(300, 500, 10) > 300 && horizonRow(300, 500, -10) < 300);
  assert.equal(projectGround({ forward: 10, right: 0 }, { ...view, pitchDeg: 85 }), null, 'looking at the sky: ground out of view');
});

test('phone pitch: upright in the box is level, flat on its back looks down', () => {
  assert.ok(Math.abs(cameraPitch(90, 0)) < 1e-9);
  assert.ok(Math.abs(cameraPitch(0, 90)) < 1e-9);
  assert.ok(Math.abs(cameraPitch(0, 0) + 90) < 1e-9);
});
