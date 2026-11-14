/**
 * Camera and Mars walk modes: walk for real with GPS, and also drive like the sim (WASD, gamepad, Ground Control's
 * Drive, "Next stop"), so everything that works in the sim works here too, even indoors.
 * The driven part is an offset on top of the GPS fix (metres north / east), so real walking still moves you.
 */
const R = 6371000;            // Earth: the field frame is real latitude / longitude
const TURN_DEG_PER_S = 90;
const RUN_FACTOR = 2.5;
const DEG = Math.PI / 180;

export function createVirtualWalk(field, { walkMps = 0.8, speed = 1, clock = () => performance.now() } = {}) {
  let move = { forward: 0, right: 0, turn: 0, run: false, boost: 0 };
  let north = 0, east = 0, turned = 0;
  let last = null;

  function advance(heading) {
    const t = clock();
    const dt = last == null ? 0 : Math.min(0.25, (t - last) / 1000);
    last = t;
    turned = (turned + move.turn * TURN_DEG_PER_S * dt) % 360;
    const stick = Math.min(1, Math.hypot(move.forward, move.right));
    if (!stick) return;
    const pace = walkMps * (move.boost || speed) * (move.run ? RUN_FACTOR : 1) * stick;
    const h = (heading + Math.atan2(move.right, move.forward) / DEG) * DEG;
    north += Math.cos(h) * pace * dt;
    east += Math.sin(h) * pace * dt;
  }

  return {
    ...field,
    frame: field.frame,
    start: (...a) => field.start(...a),
    stop: (...a) => field.stop(...a),
    getBackground: (...a) => field.getBackground(...a),
    capturePhoto: (...a) => field.capturePhoto(...a),
    get gpsError() { return field.gpsError; },
    getPosition() {
      const p = field.getPosition();
      if (!p) return null;
      const heading = ((p.heading + turned) % 360 + 360) % 360;
      advance(heading);
      const [lat, lon] = p.at;
      const at = [lat + (north / R) / DEG, lon + (east / (R * Math.cos(lat * DEG))) / DEG];
      return { ...p, at, heading, hasHeading: p.hasHeading || turned !== 0 };
    },
    /** Same as the sim: { forward, right, turn } in −1..1, run, boost = speed × (Ground Control's Drive). */
    setMoveInput(v = {}) {
      move = { forward: v.forward ?? 0, right: v.right ?? 0, turn: v.turn ?? 0, run: !!v.run, boost: v.boost || 0 };
    },
    /** "Next stop": stand at a point of the field frame ([lat, lon]) by moving the offset there. */
    jumpTo([lat, lon]) {
      const p = field.getPosition();
      if (!p) return;
      const [gLat, gLon] = p.at;
      north = (lat - gLat) * DEG * R;
      east = (lon - gLon) * DEG * R * Math.cos(gLat * DEG);
    },
    /** Back to where the GPS says you are. */
    resetOffset() { north = 0; east = 0; turned = 0; },
  };
}
