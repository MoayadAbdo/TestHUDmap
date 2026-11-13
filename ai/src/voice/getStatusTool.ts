
import type { MissionStatus, StatusProvider } from "../contracts/MissionStatus";
import type { ClientToolHandler } from "../contracts/VoiceSession";
import { errorMessage } from "../utils/errorMessage";

/** Must match the client tool name configured on the ElevenLabs agent exactly. */
export const GET_STATUS_TOOL_NAME = "get_status";

export const DEFAULT_STATUS_TIMEOUT_MS = 5000;

export const UNKNOWN = "unknown";

/** What the agent receives: the HUD fields, with missing readings as "unknown". */
export type AgentStatus = {
  [K in keyof MissionStatus]: Exclude<MissionStatus[K], null> | typeof UNKNOWN;
};

export class StatusUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Live astronaut status is unavailable (${reason}). ` +
        "Do not estimate or invent oxygen, distance, radiation, temperature or stop values. " +
        "Tell the astronaut that live status could not be read and to check the HUD directly.",
    );
    this.name = "StatusUnavailableError";
  }
}

export interface GetStatusToolOptions {
  timeoutMs?: number;
  /** Notified of every call outcome, e.g. for a UI log. */
  onResult?: (result: { ok: true; status: AgentStatus } | { ok: false; error: string }) => void;
}

/**
 * Build the `get_status` client tool around an injected `StatusProvider`.
 *
 * Fails (so the SDK sends `is_error: true` to the agent) only when the status
 * is late, missing, or has no valid `o2_pct` / `must_return`. Other missing
 * readings are passed as "unknown", never as made-up values.
 */
export function createGetStatusTool(
  statusProvider: StatusProvider,
  options: GetStatusToolOptions = {},
): ClientToolHandler {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS;

  return async () => {
    try {
      const status = toAgentStatus(await withTimeout(statusProvider.getStatus(), timeoutMs));
      options.onResult?.({ ok: true, status });
      return JSON.stringify(status);
    } catch (error) {
      const failure =
        error instanceof StatusUnavailableError ? error : new StatusUnavailableError(errorMessage(error));
      options.onResult?.({ ok: false, error: failure.message });
      throw failure;
    }
  };
}

/** Runtime check at the HUD boundary. Only oxygen and the return order are required. */
export function toAgentStatus(value: unknown): AgentStatus {
  if (typeof value !== "object" || value === null) {
    throw new StatusUnavailableError("status provider returned no data");
  }
  const r = value as Record<string, unknown>;
  const bad: string[] = [];
  if (!isFiniteNumber(r.o2_pct)) bad.push("o2_pct");
  if (typeof r.must_return !== "boolean") bad.push("must_return");
  if (bad.length > 0) {
    throw new StatusUnavailableError(`invalid or missing fields: ${bad.join(", ")}`);
  }
  return {
    stop: numberOrUnknown(r.stop),
    stop_name: typeof r.stop_name === "string" && r.stop_name.trim() !== "" ? r.stop_name : UNKNOWN,
    dist_next_m: numberOrUnknown(r.dist_next_m),
    dist_base_m: numberOrUnknown(r.dist_base_m),
    o2_pct: r.o2_pct as number,
    o2_minutes_left: numberOrUnknown(r.o2_minutes_left),
    must_return: r.must_return as boolean,
    rad_uSv_h: numberOrUnknown(r.rad_uSv_h),
    temp_c: numberOrUnknown(r.temp_c),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrUnknown(value: unknown): number | typeof UNKNOWN {
  return isFiniteNumber(value) ? value : UNKNOWN;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`status provider timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
