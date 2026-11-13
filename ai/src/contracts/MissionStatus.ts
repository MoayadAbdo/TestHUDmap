
/** Stop id used while the astronaut walks back to base (the base is stop 0 in mission.json). */
export const BASE_STOP_ID = 0;

/** Live suit status from the HUD. Distances are Mars metres. `null` means unknown. */
export interface MissionStatus {
  /** Stop the astronaut is walking to (the next target), not the one they stand at. 0 = base. */
  stop: number | null;
  /** Name of that same stop ("Base" when walking back). */
  stop_name: string | null;
  /** Metres to that same stop. */
  dist_next_m: number | null;
  /** Metres to base. */
  dist_base_m: number | null;
  /** Oxygen left, percent. Always present. */
  o2_pct: number;
  /** Minutes of oxygen left. */
  o2_minutes_left: number | null;
  /** True = the suit orders a return to base. Always present. */
  must_return: boolean;
  /** Radiation, microsieverts per hour. */
  rad_uSv_h: number | null;
  /** Outside temperature, °C. */
  temp_c: number | null;
  /** Why the suit ordered the return (e.g. "Solar storm: radiation rising"); null while walking. Optional. */
  return_reason?: string | null;
  /** Minutes to walk home along the route. Optional. */
  walk_home_min?: number | null;
  /** Radiation dose so far on this walk, microsieverts. Optional. */
  rad_dose_uSv?: number | null;
}

export interface StatusProvider {
  getStatus(): Promise<MissionStatus>;
}
