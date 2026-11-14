import { LIMITS, RETURN_REASONS, alertLevel, evaluateAlerts } from './core/alerts.js';
import { createBiosigns } from './core/biosigns.js';
import { EARTH_RADIUS_M, MARS_RADIUS_M, bearingDeg, distanceM } from './core/geo.js';
import { arrowAngle, createNavigator, etaMinutes } from './core/nav.js';
import { baseMessage, createBaseFix } from './core/base-fix.js';
import { gpsWarning } from './core/gps-health.js';
import { sideReadouts } from './core/readouts.js';
import { createRoutePlanner, pathGuide, pathLength } from './core/path.js';
import { evaClock } from './core/eva-clock.js';
import { createDetailAuto } from './core/detail-auto.js';
import { createSafePlanner } from './core/safe-path.js';
import { createDangerWatch } from './core/danger-watch.js';
import { createEnergyModel } from './core/energy.js';
import { createPeakTimer, marstepInsights } from './core/marstep.js';
import { createScience } from './core/science.js';
import { relativeTo } from './core/ar.js';
import { buildScene } from './core/scene.js';
import { createStopCard, nearbyReachedStop } from './core/stop-card.js';
import { placeInfo, importantLines, infoTitle } from './core/place-info.js';
import { buildStatus } from './core/status.js';
import { createSteepWatch } from './core/steep-watch.js';
import { createSuit } from './core/suit.js';
import { createTwin } from './core/twin.js';

const TICK_MS = 250;
const TELEMETRY_MS = 1000;
const PHOTO_MS = 2000;
const MESSAGE_MS = 12000;
const STEEP_DEG = 12;
// the suit already says these out loud: the AI should know, not repeat them
const ANNOUNCED = ' (The suit already announced this out loud; do not repeat it unless the astronaut asks.)';
const SLOPE_LOOK_M = 15;           // the steep-ground alert looks this far along the planned path
const HOME_PLAN_MS = 3000;         // re-measure the walk home this often
const SOLAR_MS = 5 * 60000;        // a solar particle event in the demo lasts 5 minutes
const SOLAR_FACTOR = 40;           // dose rate during the event (RAD saw large jumps in strong events)

/**
 * The HUD's brain: position in, navigation, oxygen, alerts, cards and messages out.
 * Everything it talks to is passed in, so stand-ins and the real parts are interchangeable.
 */
export function createHudApp({
  mission: rawMission, source, live, voice, link = { label: 'Habitat link', bars: 4 }, terrain = null, grid = null, knowledge = null,
  dangers = { zones: false, signs: false, profile: false, glow: false },
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
  // terrain-aware oxygen: effort from slope, roughness and loose ground; energy (and O₂) to walk home
  const energy = createEnergyModel({
    grid, heights: terrain?.heights ?? null, baseMars: mission.anchor?.mars ?? null,
    o2PctPerMin: mission.suit?.o2_pct_per_min ?? 0.25, reserveMin: LIMITS.reserveMinutes,
  });
  let energyNow = null;             // { effortW, homeKJ, homeO2L, homePct, reservePct, margin }
  let marstepNow = null;            // what MarStep reads off that one number (core/marstep.js)
  let nextTrip = null;              // { toStopPct, stopHomePct } for the next stop, re-measured with the walk home
  const peak = createPeakTimer();   // minutes above the suit's design peak
  const o2PctPerMin = mission.suit?.o2_pct_per_min ?? 0.25;
  let lastGrade = null;             // { mars, h } for the slope under the feet
  const baseFix = createBaseFix({ clock });
  const stopCount = mission.stops.length;

  let world = null;
  let nav = null;
  let planner = null;
  let watch = null;                 // dangers around the walker (signs, profile, edge glow), when they're on
  let step = null;
  let mustReturn = false;
  let alerts = [];
  const science = createScience({ stops: mission.stops });
  const card = createStopCard({ awayMs: source.frame === 'mars' ? 0 : undefined });
  const INFO_MS = 15000;                              // the "What's here?" card stays this long
  let info = null, infoSeq = 0;
  let message = null;
  let aiText = '';
  let forcedSlopeUntil = 0;
  let radDoseUsv = 0;
  let hazard = null;               // { name, until } — solar storm, O2 leak or a recall from Ground Control
  let returnReason = null;
  let homeM = null;                 // walk home along the route (Mars metres of the frame)
  let homeAt = -Infinity;
  const walkingMps = source.frame === 'mars' ? 0.35 : 0.6;   // GPS jitters more
  const detail = createDetailAuto({ moveMps: walkingMps });
  const steepWatch = createSteepWatch({ walkingMps, limitDeg: STEEP_DEG, clock });
  const startedAt = clock();
  let lastTickMs = clock();
  let lastSpot = null;
  let speedMps = 0;
  let slopeNow = 0;
  let bio = { heartBpm: 72, breathsPerMin: 14 };
  const intervals = [];

  function buildWorld(toFrame, r, marsPerFrameMetre, toMars) {
    const stops = mission.stops.map((s) => ({ ...s, at: toFrame(s.mars) }));
    const route = (mission.route ?? []).map((p) => (Array.isArray(p) ? { at: toFrame(p), slope_deg: 0 } : { ...p, at: toFrame(p.mars) }));
    world = { stops, route, base: { at: toFrame(mission.anchor.mars) }, r, marsPerFrameMetre, toMars, toFrame };
    nav = createNavigator({ stops, base: world.base, r });
    // safest path on the real height map (avoids steep ground); along the rover's route when there's no map
    const alongRoute = createRoutePlanner({ route, r });
    planner = terrain ? createSafePlanner({ terrain, grid, toMars, toFrame, r, fallback: alongRoute, clock }) : alongRoute;
    watch = grid && (dangers.signs || dangers.profile || dangers.glow) ? createDangerWatch({ grid, toMars, toFrame, r, show: dangers }) : null;
    world.home = alongRoute;                     // the way home: back along the checked route, never cross-country
    homeAt = -Infinity;
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

  /** A new sample: tell the astronaut, the voice agent (and Ground Control through telemetry). */
  function sampleLogged(sample) {
    if (!sample) return;
    message = { text: `SAMPLE LOGGED · ${sample.name} (${science.done}/${science.total})`, fromGround: false, until: clock() + MESSAGE_MS };
    voice.sendContext(`Sample logged at stop ${sample.id}, ${sample.name}. ${science.done} of ${science.total} samples done.${ANNOUNCED}`);
  }

  function arrive(stop, t, allDone) {
    card.show(stop, t);
    if (source.frame !== 'mars') sampleLogged(science.log(stop.id, 'photo', now()));   // camera mode: the arrival photo
    if (allDone) message = { text: 'All stops done: walk back to base', fromGround: false, until: t + MESSAGE_MS };
    const sentence = (label, value) => (value ? ` ${label}: ${String(value).replace(/[.\s]+$/, '')}.` : '');
    voice.sendContext(`The astronaut reached stop ${stop.id} of ${stopCount}: ${stop.name}.`
      + sentence('Task', stop.task) + sentence('Hazard', stop.hazard) + sentence('Science', stop.science) + ANNOUNCED);
  }

  // Field / Mars walk: say when the GPS is weak or stuck, at most every 12 s
  let gpsWarnAt = 0;
  function gpsHealth(position, t) {
    if (source.frame !== 'field' || t - gpsWarnAt < 12000) return;
    const text = gpsWarning(position, now());
    if (text) { gpsWarnAt = t; message = { text, fromGround: false, until: t + MESSAGE_MS }; }
  }

  /** Radiation now (µSv/h): the stop's RAD value, many times higher during a solar storm. */
  function radRate(t) {
    const base = conditions()?.rad_uSv_h ?? 0;
    return hazard?.name === 'solar' && t <= hazard.until ? base * SOLAR_FACTOR : base;
  }

  /** Walking slows on slopes (suit + 0.38 g): about half speed at 20°. */
  const slowdown = (deg) => 1 / (1 + Math.max(0, deg) / 20);

  /** Grade of the ground just walked (sinθ, + uphill) from the height map; 0 off the map or standing still. */
  function gradeUnderFeet(mars) {
    const c = grid?.cellOf(mars);
    const h = c == null ? null : terrain?.heights?.[c];
    if (!Number.isFinite(h)) { lastGrade = null; return 0; }
    if (!lastGrade) { lastGrade = { mars, h, sinT: 0 }; return 0; }
    const run = distanceM(lastGrade.mars, mars, MARS_RADIUS_M);
    if (run < 1.5) return lastGrade.sinT;                      // wait for a few steps: one cell is noisy
    const sinT = Math.max(-0.7, Math.min(0.7, (h - lastGrade.h) / Math.hypot(run, h - lastGrade.h)));
    lastGrade = { mars, h, sinT };
    return sinT;
  }

  /** Steepest ground in the next few metres of the path the arrows show (not the rover's line). */
  function slopeAlongPath(position) {
    const guide = guideFrom(position);
    let steepest = 0;
    let steepRun = 0;                               // need a metre of steep ground, not one noisy cell
    for (const p of guide.samples) {
      if (p.d > SLOPE_LOOK_M) break;
      const deg = planner.slopeAt(p.at) ?? 0;
      steepRun = deg > STEEP_DEG ? steepRun + 1 : 0;
      if (steepRun >= 2) steepest = Math.max(steepest, deg);
    }
    return steepest;
  }

  /** Start an emergency: the walk ends and the astronaut heads home. */
  function startHazard(name, ms = SOLAR_MS) {
    hazard = { name, until: clock() + ms };
    tick();
  }

  function tick() {
    const t = clock();
    suit.update(t);
    const position = source.getPosition();
    if (hazard && t > hazard.until) hazard = null;
    const dtMs = t - lastTickMs;
    radDoseUsv += (radRate(t) * dtMs) / 3600000;
    lastTickMs = t;
    if (!position || !ensureWorld(position)) return;
    gpsHealth(position, t);

    if (lastSpot) {
      const jumpM = distanceM(lastSpot.at, position.at, world.r);
      const moved = jumpM / Math.max(0.001, (t - lastSpot.t) / 1000);
      speedMps = jumpM > 8 ? 0 : speedMps + 0.3 * (Math.min(moved, 3) - speedMps);   // a jump to a stop is not walking
    }
    lastSpot = { at: position.at, t };

    step = nav.update(position.at, t);
    if (step.arrived) arrive(step.arrived, t, step.done);
    card.update(position.at, t, world.r);

    const slope = t < forcedSlopeUntil ? 30 : slopeAlongPath(position);
    if (t - homeAt > HOME_PLAN_MS) {
      homeAt = t;
      homeM = pathLength(world.home.plan(position.at, world.base.at), world.r);
      nextTrip = mustReturn || step.target.isBase ? null : nextStopTrip(position);
    }
    slopeNow = slope;
    const mars = world.toMars(position.at);
    energy.update({ speedMps, sinT: gradeUnderFeet(mars), mars }, dtMs);
    suit.setEffort(energy.effortFactor);
    const routeM = (homeM ?? step.baseDistanceM) * world.marsPerFrameMetre;
    energyNow = energy.readout({ o2Pct: suit.o2Pct, mars, fallbackM: routeM });
    peak.update(energyNow.effortW, dtMs);
    marstepNow = marstepInsights({
      energy: energyNow, model: energy, o2Pct: suit.o2Pct, o2PctPerMin, routeM, peakMin: peak.minutes,
      next: mustReturn || step.target.isBase ? null : nextTrip,
    });
    bio = body.update({ speedMps, slopeDeg: Math.min(slope, 30), lowOxygen: suit.o2Pct < 30 });
    const result = evaluateAlerts({
      slopeAheadDeg: t < forcedSlopeUntil || steepWatch.update(slope, speedMps) ? slope : 0,   // only while walking into it
      o2Pct: suit.o2Pct,
      o2MinutesLeft: suit.minutesLeft,
      walkBackMinutes: etaMinutes(homeM ?? step.baseDistanceM, walkSpeed * slowdown(slope)),
      alreadyReturning: mustReturn,
      hazard: hazard?.name ?? null,
      returnMargin: energyNow?.margin,
    });
    if (result.mustReturn && !mustReturn) {
      mustReturn = true;
      returnReason = result.reason;
      card.close();                                  // the way home matters more than the card
      nav.goHome();
      step = nav.update(position.at, t);
      const why = RETURN_REASONS[returnReason] ?? 'Safety limit reached';
      voice.sendContext(`${why}. The astronaut must return to base now, along the route.${ANNOUNCED}`);
    }
    alerts = result.alerts;
  }

  /** MarStep: oxygen to walk to the next stop, and to walk home from there (% of the tank). */
  function nextStopTrip(position) {
    const from = world.toMars(position.at);
    const to = world.toMars(step.target.at);
    const alongM = pathLength(planner.plan(position.at, step.target.at), world.r) * world.marsPerFrameMetre;
    const stopToBaseM = distanceM(step.target.at, world.base.at, world.r) * world.marsPerFrameMetre;
    return {
      toStopPct: energy.tripJoules(from, to, alongM) * energy.pctPerJoule,
      stopHomePct: energy.homeJoules(to, stopToBaseM * 1.2) * energy.pctPerJoule,   // off the map: straight line + 20 %
    };
  }

  // 3D Mars (sim / Mars walk): how far below the eye the real ground is at a point, so arrows sit on it
  const world3d = source.world3d ?? source.sim;
  function eyeAt(at) {
    const drop = world3d?.eyeDrop?.(...world.toMars(at));
    return Number.isFinite(drop) ? Math.max(0.3, drop) : null;
  }

  /** 3D sim: the nearest unscanned science rock within 25 m (to mark it) and the scan in progress. */
  function scanView(position, heading) {
    const targets = world3d?.scanTargets?.() ?? [];
    let near = null;
    for (const tg of targets) {
      const id = rawMission.stops[tg.index]?.id;
      if (rawMission.stops[tg.index]?.is_base || tg.scanned || science.has(id)) continue;
      const at = world.toFrame(tg.mars);
      const distM = distanceM(position.at, at, world.r);
      if (distM <= 25 && (!near || distM < near.distM)) near = { id, distM, screen: world3d.rockOnScreen?.(tg.index) ?? null, eye: eyeAt(at), ...relativeTo(position.at, heading, at, world.r) };
    }
    const p = world3d?.scanProgress?.();
    return { target: near, progress: p && !rawMission.stops[p.index]?.is_base ? p.progress : 0 };
  }

  /** The walking path from here to the target (not the straight line), and what the visor needs from it. */
  function guideFrom(position) {
    const path = planner.plan(position.at, step.target.at);
    return { ...pathGuide(path, world.r), path };
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
      extra: {
        return_reason: mustReturn ? RETURN_REASONS[returnReason] ?? null : null,
        rad_uSv_h: Math.round(radRate(clock()) * 10) / 10,   // radiation NOW (a solar storm raises it), not the stop's normal value
        rad_now_uSv_h: Math.round(radRate(clock()) * 10) / 10,
        rad_dose_uSv: Math.round(radDoseUsv * 10) / 10,
        walk_home_min: homeM == null ? null : Math.round(etaMinutes(homeM, walkSpeed)),
        effort_w: energyNow?.effortW ?? null,
        o2_home_pct: energyNow ? Math.round(energyNow.homePct * 10) / 10 : null,
        o2_home_l: energyNow?.homeO2L ?? null,
        energy_home_kj: energyNow?.homeKJ ?? null,
        return_margin: Number.isFinite(energyNow?.margin) ? Math.round(energyNow.margin * 10) / 10 : null,
        marstep_score: marstepNow?.score ?? null,
        turn_back_min: marstepNow?.turnBackMin ?? null,
        reach_m: marstepNow?.reachM ?? null,
        effort_zone: marstepNow?.zone?.label ?? null,
        next_stop_call: marstepNow?.next?.call ?? null,
        next_stop_margin: Number.isFinite(marstepNow?.next?.margin) ? marstepNow.next.margin : null,
        hazard: hazard?.name ?? null,
        eva_min: Math.round((clock() - startedAt) / 60000),
        samples_done: science.done,
        samples_total: science.total,
      },
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
      o2_minutes_left: s.o2_minutes_left,
      rad_dose_uSv: s.rad_dose_uSv,
      rad_uSv_h: s.rad_now_uSv_h,
      temp_c: s.temp_c,
      must_return: s.must_return,
      return_reason: s.return_reason,
      walk_home_min: s.walk_home_min,
      effort_w: s.effort_w,
      o2_home_pct: s.o2_home_pct,
      return_margin: s.return_margin,
      marstep: marstepNow && {
        score: marstepNow.score, turn_back_min: marstepNow.turnBackMin, linger_min: marstepNow.lingerMin, reach_m: marstepNow.reachM,
        zone: marstepNow.zone?.label ?? null, terrain_tax: marstepNow.terrainTax, peak_min: marstepNow.peakMin,
        next: marstepNow.next, used: marstepNow.used,
      },
      eva_min: s.eva_min,
      stop_name: s.stop_name,
      science: { done: science.done, total: science.total, last: science.last?.name ?? null },
      samples: science.list(),
      place_info: info ? { id: info.id, title: info.title, lines: info.lines.map((l) => `${l.icon} ${l.text}`) } : null,
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
    /** 3D sim: the rock of mission.stops[index] was scanned. */
    logScan(index) {
      const stop = rawMission.stops[index];
      if (!stop || stop.is_base) return null;
      const sample = science.log(stop.id, 'scan', now());
      sampleLogged(sample);
      return sample;
    },
    /**
     * "What's here?": facts about the astronaut's spot from the real layers + Curiosity's findings.
     * Shows the info card on the visor (and in Ground Control's log) and returns the facts (for the voice agent).
     */
    showPlaceInfo() {
      const position = source.getPosition();
      if (!knowledge?.grid || !world || !position) return null;
      const [lat, lon] = world.toMars(position.at);
      const p = placeInfo({ grid: knowledge.grid, mission: rawMission, facts: knowledge.facts, lat, lon });
      if (!p) return null;
      info = { id: ++infoSeq, title: infoTitle(p), lines: importantLines(p), sources: p.sources, until: clock() + INFO_MS };
      return p;
    },
    /** THEMIS thermal inertia per terrain-grid cell (loose ground costs more energy). */
    setThermal(ti) {
      energy.setThermal(ti);
    },
    /** Tap while a stop card is open: close it. Returns true if it closed one. */
    dismissCard() {
      if (!card.stop && info) { info = null; return true; }     // a tap also closes the info card
      if (!card.stop) return false;
      card.close();
      return true;
    },
    /** Close the stop card, or show it again while standing at a reached stop (C key, gamepad Y). */
    toggleCard() {
      if (card.stop) { card.close(); return; }
      if (info) { info = null; return; }                         // C also closes the info card
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
      if (info && t > info.until) info = null;
      const position = source.getPosition();
      const c = conditions();
      const hud = {
        o2Pct: suit.o2Pct,
        energy: energyNow,
        marstep: marstepNow,
        radUsvH: Math.round(radRate(t) * 10) / 10,
        radHigh: hazard?.name === 'solar',
        level: alertLevel(alerts),
        returnReason: mustReturn ? RETURN_REASONS[returnReason] ?? null : null,
        walkHomeMin: homeM == null ? null : Math.max(1, Math.round(etaMinutes(homeM, walkSpeed))),
        detail: detail.mode,
        detailLevel: detail.update(t, { speedMps, busy: Boolean(card.stop || !step) }),
        tempC: c?.temp_c ?? null,
        stopLabel: `${stopLabel()} · samples ${science.done}/${science.total}`,
        science: { done: science.done, total: science.total },
        cardSample: card.stop ? { done: science.has(card.stop.id), scan: source.frame === 'mars' } : null,
        alerts,
        message: message ? (message.fromGround ? `Ground Control: ${message.text}` : message.text) : null,
        aiText,
        listening: voice.listening,
        mustReturn,
        card: card.stop,
        info: card.stop ? null : info,                   // a stop card wins; the info card comes back after it
        waiting: step ? null : waitingText(position),
      };
      Object.assign(hud, { timeMs: t }, sideReadouts({
        wallMs: now(), mission, conditionStop: conditionStop(), suit, bio, link, radDoseUsv, mustReturn, slopeDeg: slopeNow,
        eva: source.frame === 'mars' ? evaClock(t - startedAt) : null,
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
        const path = guide.samples.map((p) => ({ ...p, steep: planner.slopeAt(p.at) > STEEP_DEG, eye: eyeAt(p.at) }));
        hud.scene = buildScene({ world, position, heading, isVisited: nav.isVisited, target: step.target, path, plan: guide.path, eyeAt });
        hud.scan = scanView(position, heading);
        if (terrain) hud.mapGeo = {                                // mini-map photo: where we are on Mars, facing which way
          mars: world.toMars(position.at), heading: heading - (source.frame === 'mars' ? 0 : mission.anchor.rotation_deg ?? 0),
          bounds: terrain.bounds, W: terrain.width_m, H: terrain.height_m, marsPerMetre: world.marsPerFrameMetre,
        };
        if (source.frame === 'mars' && world3d?.projectRelative) hud.project = (f, r, lift) => world3d.projectRelative(f, r, lift);   // exact 3D placement
        if (watch) {
          watch.update({ position, heading, path: guide.path, t, slopeAt: (at) => planner.slopeAt(at) });
          hud.dangers = { ...watch.view(position, heading, eyeAt), show: dangers, walking: speedMps >= walkingMps };
        }
      }
      return { background: source.getBackground(), hud };
    },

    demo: {
      oxygenFast: () => suit.setSpeed(20),
      oxygenLow: () => suit.setO2(25),
      solarStorm: () => startHazard('solar'),
      o2Leak: () => { suit.setO2(Math.min(suit.o2Pct, 25)); startHazard('o2leak', 60 * 60000); },
      recall: () => startHazard('ground', 60 * 60000),
      /** focus ↔ full panels (I key, gamepad X, long tap on the side) */
      /** Reset to default: no emergency, oxygen refilled, normal oxygen use, automatic panels, back to the stops. */
      reset: () => {
        mustReturn = false;
        returnReason = null;
        hazard = null;
        forcedSlopeUntil = 0;
        alerts = [];
        suit.setSpeed(1);
        suit.setO2(mission.suit?.o2_start_pct ?? 100);
        detail.reset();
        steepWatch.reset();
        card.close();
        nav?.resume();
        message = { text: 'Reset: everything back to normal', fromGround: false, until: clock() + MESSAGE_MS };
      },
      toggleDetail: () => {
        const mode = detail.toggle();
        message = { text: mode === 'full' ? 'All suit panels on' : 'Suit panels: automatic (stand still to see them)', fromGround: false, until: clock() + MESSAGE_MS };
        return mode;
      },
      steepGround: () => {
        forcedSlopeUntil = clock() + 10000;
      },
      // the sims count stops as in mission.json (base included), so find the target there by id
      nextStop: () => {
        if (source.frame === 'field') { if (step?.target?.at) source.jumpTo?.(step.target.at); return; }   // camera / Mars walk
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
