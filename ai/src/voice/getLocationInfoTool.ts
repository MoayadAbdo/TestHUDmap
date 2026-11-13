import type { ClientToolHandler } from "../contracts/VoiceSession";
import { errorMessage } from "../utils/errorMessage";

/** Must match the client tool name configured on the ElevenLabs agent exactly. */
export const GET_LOCATION_INFO_TOOL_NAME = "get_location_info";

/** What the HUD's `window.hud.placeInfo()` returns (web/hud/js/core/place-info.js), or null. */
interface RawPlaceInfo {
  stop?: { id?: unknown; name?: unknown; distance_m?: unknown } | null;
  lines?: Array<{ kind?: unknown; text?: unknown }>;
  sources?: unknown[];
}

/** What the agent receives: short facts it may say, with where they come from. */
export interface AgentLocationInfo {
  place: string;
  near_stop: { id: number; name: string; distance_m: number } | null;
  facts: string[];
  sources: string[];
  rules: string;
}

const RULES =
  "Only state local facts listed here. Mineral lines are hints from orbit, not confirmed. " +
  "Answer in 1-2 sentences; the full list is already on the astronaut's visor.";

const NOT_KNOWN =
  "The astronaut's position is not known yet or is outside the mapped area. " +
  "Do not guess what is here; say the location facts are not available and to try again in a moment.";

export interface GetLocationInfoToolOptions {
  /** Notified of every call outcome, e.g. for a UI log. */
  onResult?: (result: { ok: true; info: AgentLocationInfo } | { ok: false; error: string }) => void;
}

/**
 * Build the `get_location_info` client tool. Calling it also opens the "What's here?" card on the
 * visor (that's what `window.hud.placeInfo()` does), so the astronaut sees what the agent says.
 */
export function createGetLocationInfoTool(
  getPlaceInfo: () => unknown,
  options: GetLocationInfoToolOptions = {},
): ClientToolHandler {
  return async () => {
    let info: AgentLocationInfo | null;
    try {
      info = toAgentLocationInfo(getPlaceInfo());
    } catch (error) {
      options.onResult?.({ ok: false, error: errorMessage(error) });
      throw new Error(`${NOT_KNOWN} (${errorMessage(error)})`);
    }
    if (!info) {
      options.onResult?.({ ok: false, error: "no position" });
      throw new Error(NOT_KNOWN);
    }
    options.onResult?.({ ok: true, info });
    return JSON.stringify(info);
  };
}

/** Runtime check at the HUD boundary: keeps only well-formed text; null when there is nothing to say. */
export function toAgentLocationInfo(value: unknown): AgentLocationInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as RawPlaceInfo;
  const facts = (Array.isArray(raw.lines) ? raw.lines : [])
    .filter((l) => l && l.kind !== "stop" && typeof l.text === "string" && l.text.trim() !== "")
    .map((l) => (l.text as string).trim());
  if (facts.length === 0) return null;
  const s = raw.stop;
  const near_stop =
    s && typeof s.id === "number" && typeof s.name === "string"
      ? { id: s.id, name: s.name, distance_m: typeof s.distance_m === "number" ? s.distance_m : 0 }
      : null;
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter(
    (x): x is string => typeof x === "string" && x.trim() !== "",
  );
  return { place: near_stop ? `near stop ${near_stop.id}, ${near_stop.name}` : "between stops", near_stop, facts, sources, rules: RULES };
}
