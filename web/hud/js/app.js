import { evaluateAlerts } from './core/alerts.js';
import { createBiosigns } from './core/biosigns.js';
import { EARTH_RADIUS_M, MARS_RADIUS_M, bearingDeg, distanceM } from './core/geo.js';
import { arrowAngle, createNavigator, etaMinutes } from './core/nav.js';
import { slopeAhead } from './core/route.js';
import { baseMessage, createBaseFix } from './core/base-fix.js';
import { gpsWarning } from './core/gps-health.js';
import { sideReadouts } from './core/readouts.js';
import { createRoutePlanner, pathGuide } from './core/path.js';
import { buildScene } from './core/scene.js';
import { createStopCard, nearbyReachedStop } from './core/stop-card.js';
import { buildStatus } from './core/status.js';
import { createSuit } from './core/suit.js';
import { createTwin } from './core/twin.js';

const TICK_MS = 250;
const TELEMETRY_MS = 1000;
const PHOTO_MS = 2000;
const MESSAGE_MS = 12000;
const STEEP_DEG = 12;

/**
 * The HUD's brain: position in, navigation, oxygen, alerts, cards and messages out.
 * Everything it talks to is passed in, so stand-ins and the real parts are interchangeable.
 */
export function createHudApp({
  mission: rawMission, source, live, voice, link = { label: 'Habitat link', bars: 4 },
  clock = () => performance.now(), now = () => Date.now(), timers = window,
}) {
  // The official mission.json lists the base as a stop with "is_base": true; the HUD uses anchor.mars as base.
  const mission = { ...rawMission, stops: rawMission.stops.filter((s) => !s.is_base) };
  const walkSpeed = mission.suit?.walk_speed_mps ?? 0.8;
  const suit = createSuit({
    o2StartPct: mission.suit?.o2_start_pct ?? 100,
    o2PctPerMin: mission.suit?.o2_pct_per_min ?? 0.25,
    powerPctPerMin: mission.suit?.power_pct_per_min ?? 0.2,
    startMs: clock(),
  });
  const body = createBiosigns();
  const baseFix = createBaseFix({ clock });
  const stopCount = mission.stops.length;

  let world = null;
  let nav = null;
  let planner = null;
  let step = null;
  let mustReturn = false;
  let alerts = [];
  const card = createStopCard();
  let message = null;
  let aiText = '';
  let forcedSlopeUntil = 0;
  let radDoseUsv = 0;
  let lastTickMs = clock();
  let lastSpot = null;
  let speedMps = 0;
  let slopeNow = 0;
  let bio = { heartBpm: 72, breathsPerMin: 14 };
  const intervals = [];

  function buildWorld(toFrame, r, marsPerFrameMetre, toMars) {
    const stops = mission.stops.map((s) => ({ ...s, at: toFrame(s.mars) }));
    const route = (mission.route ?? []).map((p) => (Array.isArray(p) ? { at: toFrame(p), slope_deg: 0 } : { ...p, at: toFrame(p.mars) }));
    world = { stops, route, base: { at: toFrame(mission.anchor.mars) }, r, marsPerFrameMetre, toMars };
    nav = createNavigator({ stops, base: world.base, r });
    planner = createRoutePlanner({ route, r });   // swap for a slope-map planner when one exists
    if (mustReturn) nav.goHome();                  // a new base doesn't cancel return-to-base
  }

  /** Sim walks on Mars directly. Field mode maps Mars to the desert; with no desert anchor, the first good GPS fix is base. */
  let baseForced = false;
  function ensureWorld(position) {
    if (world) return true;
    if (source.frame === 'mars') {
      buildWorld((p) => p, MARS_RADIUS_M, 1, (p) => p);
      return true;
    }
    const anchor = { ...mission.anchor };
    if (!anchor.field || baseForced) {
      const fix = baseFix.choose(position);
      if (!fix) return false;
      baseForced = false;
      anchor.field = fix.at;
      message = { text: baseMessage(fix.accuracy), fromGround: false, until: clock() + MESSAGE_MS };
    }
    const twin = createTwin(anchor);
    buildWorld(twin.marsToField, EARTH_RADIUS_M, 1 / twin.scale, twin.fieldToMars);
    return true;
  }

  /** The stop whose weather and radiation are shown: the one ahead, or the last one on the way home. */
  function conditionStop() {
    if (!step) return mission.stops[0] ?? null;
    if (!step.target.isBase) return step.target;
    return mission.stops[Math.max(0, nav.lastReachedIndex)] ?? null;
  }
  const conditions = () => conditionStop()?.conditions ?? null;

  function arrive(stop, t, allDone) {
    card.show(stop, t);
    if (allDone) message = { text: 'All stops done: walk back to base', fromGround: false, until: t + MESSAGE_MS };
    const sentence = (label, value) => (value ? ` ${label}: ${String(value).replace(/[.\s]+$/, '')}.` : '');
    voice.sendContext(`The astronaut reached stop ${stop.id} of ${stopCount}: ${stop.name}.`
      + sentence('Task', stop.task) + sentence('Hazard', stop.hazard) + sentence('Science', stop.science));
  }

  // Field / Mars walk: say when the GPS is weak or stuck, at most every 12 s
  let gpsWarnAt = 0;
  function gpsHealth(position, t) {
    if (source.frame !== 'field' || t - gpsWarnAt < 12000) return;
    const text = gpsWarning(position, now());
    if (text) { gpsWarnAt = t; message = { text, fromGround: false, until: t + MESSAGE_MS }; }
  }

  function tick() {
    const t = clock();
    suit.update(t);
    const position = source.getPosition();
    radDoseUsv += ((conditions()?.rad_uSv_h ?? 0) * (t - lastTickMs)) / 3600000;
    lastTickMs = t;
    if (!position || !ensureWorld(position)) return;
    gpsHealth(position, t);

    if (lastSpot) {
      const moved = distanceM(lastSpot.at, position.at, world.r) / Math.max(0.001, (t - lastSpot.t) / 1000);
      speedMps += 0.3 * (Math.min(moved, 3) - speedMps);
    }
    lastSpot = { at: position.at, t };

    step = nav.update(position.at, t);
    if (step.arrived) arrive(step.arrived, t, step.done);
    card.update(position.at, t, world.r);

    const slope = t < forcedSlopeUntil ? 90 : slopeAhead(world.route, position.at, world.r);
    slopeNow = slope;
    bio = body.update({ speedMps, slopeDeg: Math.min(slope, 30), lowOxygen: suit.o2Pct < 30 });
    const result = evaluateAlerts({
      slopeAheadDeg: slope,
      o2Pct: suit.o2Pct,
      o2MinutesLeft: suit.minutesLeft,
      walkBackMinutes: etaMinutes(step.baseDistanceM, walkSpeed),
      alreadyReturning: mustReturn,
    });
    if (result.mustReturn && !mustReturn) {
      mustReturn = true;
      card.close();                                  // the way home matters more than the card
      nav.goHome();
      step = nav.update(position.at, t);
      voice.sendContext('The oxygen reserve is reached. The astronaut must return to base now.');
    }
    alerts = result.alerts;
  }

  /** The walking path from here to the target (not the straight line), and what the visor needs from it. */
  function guideFrom(position) {
    return pathGuide(planner.plan(position.at, step.target.at), world.r);
  }

  function status() {
    if (!step) return null;
    const position = source.getPosition();
    const alongM = position ? guideFrom(position).lengthM : step.distanceM;
    return buildStatus({
      nav: { ...step, distanceM: alongM },
      stopCount,
      marsPerFrameMetre: world.marsPerFrameMetre,
      o2Pct: suit.o2Pct,
      o2MinutesLeft: suit.minutesLeft,
      mustReturn,
      conditions: conditions(),
    });
  }

  function sendTelemetry() {
    const position = source.getPosition();
    const s = status();
    if (!position || !s) return;
    live.sendTelemetry({
      t: now(),
      mode: source.frame === 'mars' ? 'sim' : 'field',
      field: source.frame === 'field' ? position.at : null,
      mars: world.toMars(position.at),
      heading: Math.round(position.heading),
      stop: s.stop,
      dist_next_m: s.dist_next_m,
      dist_base_m: s.dist_base_m,
      o2_pct: s.o2_pct,
      rad_dose_uSv: Math.round(radDoseUsv * 10) / 10,
      alerts,
    });
  }

  async function sendPhoto() {
    if (source.frame !== 'field') return;
    const photo = await source.capturePhoto(320);
    if (photo) live.sendPhoto(photo);
  }

  function waitingText(position) {
    if (!position) return source.frame === 'field' ? (source.gpsError || 'Waiting for GPS…') : 'Starting the sim…';
    if (!world) return `Finding a good GPS fix (±${Math.round(position.accuracy)} m)…`;
    return null;
  }

  function stopLabel() {
    if (!step || !step.target.isBase) return `Stop ${step ? step.target.id : 1}/${stopCount}`;
    return step.done ? 'All stops done' : 'Base';
  }

  live.onMessage?.((m) => {
    message = { text: typeof m === 'string' ? m : m?.text ?? '', fromGround: true, until: clock() + MESSAGE_MS };
  });
  voice.onText?.((text) => {
    aiText = text;
  });

  return {
    start() {
      tick();
      intervals.push(timers.setInterval(tick, TICK_MS));
      intervals.push(timers.setInterval(sendTelemetry, TELEMETRY_MS));
      intervals.push(timers.setInterval(sendPhoto, PHOTO_MS));
    },
    stop() {
      intervals.splice(0).forEach((id) => timers.clearInterval(id));
    },
    getStatus: status,
    onTap() {
      voice.toggle();
    },
    /** Close the stop card, or show it again while standing at a reached stop (C key, gamepad Y). */
    toggleCard() {
      if (card.stop) { card.close(); return; }
      const position = source.getPosition();
      if (!world || !position) return;
      const stop = nearbyReachedStop(world.stops, nav.isVisited, position.at, world.r);
      if (stop) card.show(stop, clock());
    },
    /** Where the astronaut is on Mars and which way they look on Mars (null until the base is set). */
    marsPosition() {
      const position = source.getPosition();
      if (!world || !position) return null;
      const rotation = mission.anchor.rotation_deg ?? 0;
      return { mars: world.toMars(position.at), heading: (((position.heading - rotation) % 360) + 360) % 360, pitch: position.pitch ?? 0 };
    },
    /** Short message from the suit itself (not from Ground Control). */
    notify(text) {
      message = { text, fromGround: false, until: clock() + MESSAGE_MS };
    },

    /** What the renderer draws this frame. Heading is read fresh so the arrow turns smoothly. */
    frame() {
      const t = clock();
      if (message && t > message.until) message = null;
      const position = source.getPosition();
      const c = conditions();
      const hud = {
        o2Pct: suit.o2Pct,
        radUsvH: c?.rad_uSv_h ?? null,
        tempC: c?.temp_c ?? null,
        stopLabel: stopLabel(),
        alerts,
        message: message ? (message.fromGround ? `Ground Control: ${message.text}` : message.text) : null,
        aiText,
        listening: voice.listening,
        mustReturn,
        card: card.stop,
        waiting: step ? null : waitingText(position),
      };
      Object.assign(hud, { timeMs: t }, sideReadouts({
        wallMs: now(), mission, conditionStop: conditionStop(), suit, bio, link, radDoseUsv, mustReturn, slopeDeg: slopeNow,
      }));
      if (step && position) {
        const heading = position.heading ?? 0;
        const guide = guideFrom(position);
        hud.heading = heading;
        hud.pitch = position.pitch ?? 0;
        hud.targetBearing = step.bearingDeg;
        hud.arrowDeg = arrowAngle(bearingDeg(position.at, guide.toward), heading);   // along the path, not straight
        hud.distanceM = guide.lengthM * world.marsPerFrameMetre;
        hud.distanceLabel = `${Math.round(hud.distanceM)} m`;
        hud.etaMin = Math.max(1, Math.round(etaMinutes(guide.lengthM, walkSpeed)));
        hud.targetName = step.target.isBase ? 'Base' : step.target.name;
        hud.targetLabel = `${hud.targetName}, about ${hud.etaMin} min`;
        const path = guide.samples.map((p) => ({ ...p, steep: planner.slopeAt(p.at) > STEEP_DEG }));
        hud.scene = buildScene({ world, position, heading, isVisited: nav.isVisited, target: step.target, path });
      }
      return { background: source.getBackground(), hud };
    },

    demo: {
      oxygenFast: () => suit.setSpeed(20),
      oxygenLow: () => suit.setO2(25),
      steepGround: () => {
        forcedSlopeUntil = clock() + 10000;
      },
      // the sims count stops as in mission.json (base included), so find the target there by id
      nextStop: () => {
        const id = step?.target && !step.target.isBase ? step.target.id : mission.stops.at(-1)?.id;   // heading home: last stop
        const i = rawMission.stops.findIndex((s) => s.id === id);
        if (i >= 0) source.sim?.jumpToStop?.(i);
      },
      /** Field mode: make the current spot the base (e.g. after a weak first fix). The walk starts again. */
      setBaseHere: () => {
        const position = source.getPosition();
        if (source.frame !== 'field' || !position) return false;
        baseFix.force(position);
        baseForced = true;
        world = null;
        nav = null;
        step = null;
        card.close();
        return true;
      },
      message: (text) => {
        message = { text, fromGround: true, until: clock() + MESSAGE_MS };
      },
    },
  };
}
