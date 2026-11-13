import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wrap180 } from '../js/core/geo.js';
import { cameraDirection, createHeadPose } from '../js/core/head-pose.js';

const near = (a, b, tol = 1) => assert.ok(Math.abs(wrap180(a - b)) <= tol, `${a} is not within ${tol}° of ${b}`);

/**
 * A phone sideways in a VR box, looking `tilt` degrees up (+) or down (−). The browser's angles jump across
 * level: below it (a, 0, 90 − |tilt|), above it (a + 180, 180, tilt − 90). Same 3D pose, different numbers.
 */
function landscape(alpha, tilt) {
  return tilt <= 0 ? { alpha, beta: 0, gamma: 90 + tilt } : { alpha: alpha + 180, beta: 180, gamma: tilt - 90 };
}

test('the two angle sets really are the same direction (the browser jump)', () => {
  const below = cameraDirection(...Object.values(landscape(30, -0.001)));
  const above = cameraDirection(...Object.values(landscape(30, 0.001)));
  for (const k of ['east', 'north', 'up']) assert.ok(Math.abs(below[k] - above[k]) < 1e-3);
});

test('looking up and down never flips the direction (sim: no compass, faces the first stop)', () => {
  const head = createHeadPose({ startHeading: 200 });
  head.update(landscape(30, 0));
  const start = head.heading;
  near(start, 200);
  for (const tilt of [-40, -20, -5, -1, 1, 5, 20, 40, 60, 20, -10]) {
    head.update(landscape(30, tilt));
    near(head.heading, start);
    assert.ok(Math.abs(head.pitch - tilt) < 0.5, `pitch ${head.pitch} for tilt ${tilt}`);
  }
});

test('turning the head still turns the view', () => {
  const head = createHeadPose({ startHeading: 0 });
  head.update(landscape(30, 0));
  head.update(landscape(60, 10));
  near(head.heading, 330);                   // alpha +30 = turning left 30°
});

test('iPhone camera mode: north from the compass, and its 180° flip near level is ignored', () => {
  const head = createHeadPose();
  const pose = (tilt) => ({ ...landscape(30, tilt), compass: tilt > 0 ? 95 + 180 : 95 });   // iOS-style flip above level
  head.update(pose(-5));
  near(head.heading, 95);
  for (const tilt of [5, 15, -15, 25, -2]) {
    head.update(pose(tilt));
    near(head.heading, 95, 2);
  }
});

test('looking almost straight up keeps the last direction', () => {
  const head = createHeadPose({ startHeading: 120 });
  head.update(landscape(30, 0));
  head.update(landscape(80, 85));            // nearly vertical: turning makes no sense here
  near(head.heading, 120);
});
