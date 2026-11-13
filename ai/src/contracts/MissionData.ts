
/**
 * Normalized mission knowledge model.
 *
 * This is the app's internal shape for mission data. It doesn't depend on any
 * file name, JSON schema, storage mechanism, or framework. Raw JSON (mock or
 * official) is converted into this shape by the adapter in
 * `src/adapters/missionDataAdapter.ts`, the only place that knows the raw format.
 *
 * Mission knowledge (static plan: stops, tasks) is deliberately separate
 * from live astronaut status (`MissionStatus` / `StatusProvider`).
 */

/** Where the mission data came from. `"mock"` data is fictional demo content. */
export type MissionDataSource = "mock" | "official";

export interface MissionStop {
  /** Stop number. Positive integer, unique within a mission. `MissionStatus.stop` is the one being walked to. */
  id: number;
  name: string;
  description: string;
  /** Planned exploration activities at this stop. Can be empty. */
  tasks: string[];
}

export interface MissionData {
  missionId: string;
  missionName: string;
  location: string;
  source: MissionDataSource;
  /** Stops in planned visiting order. */
  stops: MissionStop[];
}

export interface MissionDataProvider {
  getMission(): Promise<MissionData>;
}

/**
 * A stop card as shown on the HUD and used in the knowledge base.
 * It's self-contained so the HUD can render it offline.
 */
export interface StopCard {
  stopId: number;
  title: string;
  description: string;
  tasks: string[];
  missionId: string;
  source: MissionDataSource;
}

export interface StopCardProvider {
  getStopCards(): Promise<StopCard[]>;
}
