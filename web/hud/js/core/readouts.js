import { lightMinutes } from './light-time.js';
import { curiositySol, formatHours, localSolarHours } from './mars-time.js';
import { siteName } from './mission-info.js';

/** The visor's side panels: place and time, suit, comms, body and suit integrity. */
export function sideReadouts({ wallMs, mission, conditionStop, suit, bio, link, radDoseUsv, mustReturn, slopeDeg, eva = null }) {
  const lonEast = mission.anchor.mars[1];
  const c = conditionStop?.conditions;
  return {
    o2MinutesLeft: suit.minutesLeft,
    powerPct: suit.powerPct,
    pressurePa: c?.pressure_pa ?? null,
    site: siteName(mission.site),
    dataSol: conditionStop?.sol ?? null,
    marsTime: eva ? eva.marsTime : formatHours(localSolarHours(wallMs, lonEast)),
    daylightMin: eva ? eva.daylightMin : null,
    evaMin: eva ? eva.elapsedMin : null,
    sol: curiositySol(wallMs, lonEast),
    earthTime: new Date(wallMs).toISOString().slice(11, 19),
    lightMin: lightMinutes(wallMs),
    link,
    radDoseUsv,
    heartBpm: bio.heartBpm,
    breathsPerMin: bio.breathsPerMin,
    integrity: {
      // simulated: the suit has no real sensors; only life support and legs react to the walk
      Helmet: 'ok',
      'Life support': mustReturn || suit.o2Pct < 30 ? 'danger' : 'ok',
      Torso: 'ok',
      Arms: 'ok',
      Legs: slopeDeg > 20 ? 'danger' : slopeDeg > 12 ? 'warn' : 'ok',
    },
  };
}
