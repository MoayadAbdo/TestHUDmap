
import { BASE_STOP_ID, type MissionStatus } from "../contracts/MissionStatus";

type RawHudStatus = Partial<Record<keyof MissionStatus, unknown>> | null | undefined;

/** The part of `window.hud` the voice assistant reads. */
export interface HudWindowApi {
  getStatus?: () => RawHudStatus;
}

/**
 * Reads `window.hud.getStatus()`. The HUD reports `stop: null` while walking
 * back to base; that becomes stop 0 (base). Values are checked later by get_status.
 */
export function createHudStatusReader(getHud: () => HudWindowApi | undefined): () => MissionStatus {
  return () => {
    const status = getHud()?.getStatus?.();
    if (!status) throw new Error("HUD status is not ready yet");
    return { ...status, stop: status.stop === null ? BASE_STOP_ID : status.stop } as MissionStatus;
  };
}
