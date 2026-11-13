/**
 * The shape the voice agent reads through hud.getStatus(). Distances are Mars metres.
 * stop / stop_name / dist_next_m: the stop the astronaut is walking TO (null / 'Base' when heading home).
 * Numbers that are unknown are null, never Infinity or NaN.
 */
export function buildStatus({ nav, stopCount, marsPerFrameMetre, o2Pct, o2MinutesLeft, mustReturn, conditions }) {
  const round = (n) => (Number.isFinite(n) ? Math.round(n) : null);
  const finite = (n) => (Number.isFinite(n) ? n : null);
  return {
    stop: nav.target.isBase ? null : Math.min(nav.target.id, stopCount),
    stop_name: nav.target.isBase ? 'Base' : nav.target.name,
    dist_next_m: round(nav.distanceM * marsPerFrameMetre),
    dist_base_m: round(nav.baseDistanceM * marsPerFrameMetre),
    o2_pct: Math.round(o2Pct * 10) / 10,
    o2_minutes_left: round(o2MinutesLeft),
    must_return: mustReturn,
    rad_uSv_h: finite(conditions?.rad_uSv_h),
    temp_c: finite(conditions?.temp_c),
  };
}
