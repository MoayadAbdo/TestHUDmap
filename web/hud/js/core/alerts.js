/**
 * Safety limits.
 * - slopeCautionDeg: our own "walk carefully" level.
 * - slopeNoGoDeg: our team's no-go limit (20°). It is our own choice, not an official NASA number;
 *   the safe path blocks at the same value (core/safe-path.js), so the arrows never lead onto NO-GO ground.
 * - lowO2Pct: below this the walk ends and the astronaut heads home.
 * - reserveMinutes: oxygen kept back on top of the walk home.
 */
export const LIMITS = { slopeDeg: 12, slopeNoGoDeg: 20, lowO2Pct: 30, reserveMinutes: 10 };

/**
 * Which alert gets the big banner when several are on (the others show as small chips under it):
 * first what you must react to in the next few steps (no-go ground), then the way home (its banner names why), then the rest.
 */
export const ALERT_PRIORITY = ['SLOPE_NO_GO', 'RETURN_TO_BASE', 'O2_LEAK', 'SOLAR_STORM', 'LOW_O2', 'SLOPE_AHEAD'];   // the return banner names its cause

/** Why the walk ended, in the words the visor and the voice use. */
export const RETURN_REASONS = {
  reserve: 'Oxygen reserve reached',
  low_o2: 'Oxygen low',
  solar: 'Solar storm: radiation rising',
  o2leak: 'Suit oxygen leak',
  ground: 'Ground Control ordered return',
};

/**
 * Return-to-base stays on once triggered (alreadyReturning), so the HUD doesn't flicker.
 * hazard: an emergency in progress ('solar', 'o2leak', 'ground'), which ends the walk at once.
 * Returns { alerts, mustReturn, reason } — reason is a key of RETURN_REASONS (null while walking).
 */
export function evaluateAlerts({ slopeAheadDeg, o2Pct, o2MinutesLeft, walkBackMinutes, alreadyReturning, hazard = null, returnMargin = null }, limits = LIMITS) {
  let reason = null;
  if (hazard) reason = hazard;
  // Return Energy Margin (core/energy.js) when the ground is known; otherwise the old time check
  else if (Number.isFinite(returnMargin) ? returnMargin < 1 : o2MinutesLeft < walkBackMinutes + limits.reserveMinutes) reason = 'reserve';
  else if (o2Pct < limits.lowO2Pct) reason = 'low_o2';
  const mustReturn = Boolean(alreadyReturning || reason);

  const alerts = [];
  if (mustReturn) alerts.push('RETURN_TO_BASE');
  if (hazard === 'solar') alerts.push('SOLAR_STORM');
  if (hazard === 'o2leak') alerts.push('O2_LEAK');
  if (o2Pct < limits.lowO2Pct) alerts.push('LOW_O2');
  if (slopeAheadDeg > (limits.slopeNoGoDeg ?? Infinity)) alerts.push('SLOPE_NO_GO');
  else if (slopeAheadDeg > limits.slopeDeg) alerts.push('SLOPE_AHEAD');
  alerts.sort((a, b) => ALERT_PRIORITY.indexOf(a) - ALERT_PRIORITY.indexOf(b));
  return { alerts, mustReturn, reason };
}

/** How serious the worst alert is: 'danger', 'caution' or null. */
export function alertLevel(alerts) {
  if (alerts.some((a) => ['RETURN_TO_BASE', 'SOLAR_STORM', 'O2_LEAK', 'LOW_O2', 'SLOPE_NO_GO'].includes(a))) return 'danger';
  if (alerts.length) return 'caution';
  return null;
}
