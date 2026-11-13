
import { BASE_STOP_ID, type MissionStatus, type StatusProvider } from "../contracts/MissionStatus";
import type { MissionStop, StopCard } from "../contracts/MissionData";
import type { MissionService } from "./MissionService";
import type { StopCardService } from "./StopCardService";
import { errorMessage } from "../utils/errorMessage";

export interface MissionSnapshot {
  /** Latest live status, or `null` if the status provider failed this time. */
  status: MissionStatus | null;
  statusError: string | null;
  /** Stop the astronaut is walking to (`status.stop`), or the last known one. 0 = base. */
  targetStopId: number | null;
  /** Local stop card for the target. Comes from bundled data and doesn't need ElevenLabs. */
  targetCard: StopCard | undefined;
  stopCardError: string | null;
  /** The stop after the target, in planned order. */
  stopAfterTarget: MissionStop | undefined;
  /** True only on the refresh where the target changed (the previous stop was reached). */
  targetChanged: boolean;
}

/**
 * Combines live status (`StatusProvider`) with local mission knowledge
 * (`MissionService`, `StopCardService`). Works without any voice
 * connection, so a screen can always show the card of the stop ahead.
 */
export class MissionContextService {
  private lastTargetId: number | null = null;

  constructor(
    private readonly statusProvider: StatusProvider,
    private readonly missionService: MissionService,
    private readonly stopCardService: StopCardService,
  ) {}

  async refresh(): Promise<MissionSnapshot> {
    let status: MissionStatus | null = null;
    let statusError: string | null = null;
    try {
      status = await this.statusProvider.getStatus();
    } catch (error) {
      statusError = errorMessage(error);
    }

    const reported = status?.stop ?? null;
    const targetStopId = reported ?? this.lastTargetId;
    const targetChanged = reported !== null && reported !== this.lastTargetId;
    if (reported !== null) this.lastTargetId = reported;

    let targetCard: StopCard | undefined;
    let stopAfterTarget: MissionStop | undefined;
    let stopCardError: string | null = null;
    if (targetStopId !== null && targetStopId !== BASE_STOP_ID) {
      try {
        targetCard = await this.stopCardService.getStopCard(targetStopId);
        stopAfterTarget = await this.missionService.getNextStop(targetStopId);
      } catch (error) {
        stopCardError = errorMessage(error);
      }
    }

    return { status, statusError, targetStopId, targetCard, stopCardError, stopAfterTarget, targetChanged };
  }
}

/**
 * Text for an ElevenLabs contextual update when the astronaut starts walking
 * to a new stop. Built only from local mission data, never from invented details.
 */
export function describeNewTarget(snapshot: MissionSnapshot): string | null {
  const { targetStopId, targetCard, stopAfterTarget } = snapshot;
  if (targetStopId === null) return null;
  if (targetStopId === BASE_STOP_ID) return "The astronaut is now walking back to base.";

  if (!targetCard) {
    return (
      `The astronaut is now walking to stop ${targetStopId}. No stop card is available for this stop. ` +
      "Do not invent its location details or tasks."
    );
  }

  const parts = [
    `The astronaut is now walking to stop ${targetCard.stopId}: ${targetCard.title}.`,
    targetCard.description,
    targetCard.tasks.length > 0
      ? `Planned tasks there: ${targetCard.tasks.join("; ")}.`
      : "No planned tasks are listed for this stop.",
    stopAfterTarget
      ? `After that: stop ${stopAfterTarget.id}, ${stopAfterTarget.name}.`
      : "This is the last planned stop.",
  ];
  if (targetCard.source === "mock") {
    parts.push("Note: this stop information is MOCK demonstration data, not official mission data.");
  }
  parts.push("For live oxygen, distance, radiation and temperature values, call get_status.");
  return parts.join(" ");
}
