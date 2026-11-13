
import type { VoiceErrorKind } from "../services/VoiceAssistantService";

const VISOR_TEXT: Record<VoiceErrorKind, string | null> = {
  configuration: "AI not set up: open with ?agent=<id>",
  microphone: "AI offline: no microphone",
  connection: "AI offline: no connection",
  // Agent and tool errors are meant for the model (the agent still answers): console only.
  agent: null,
  tool: null,
};

/** Connection failures with a known cause get a more useful line (the full message stays in the console). */
const CONNECTION_CAUSES: [RegExp, string][] = [
  [/\b404\b|not found/i, "AI offline: agent ID not found (check ?agent=)"],
  [/\b40[13]\b|unauthori[sz]ed|forbidden|not allowed|allowlist|origin/i, "AI offline: agent is private or this site isn't allowed"],
  [/quota|credit|limit|\b429\b|\b402\b/i, "AI offline: ElevenLabs credits or limit reached"],
];

/** Short text for the astronaut's visor, or null when the error should stay in the console. */
export function visorErrorText(kind: VoiceErrorKind, message = ""): string | null {
  if (kind === "connection") {
    for (const [pattern, text] of CONNECTION_CAUSES) if (pattern.test(message)) return text;
  }
  return VISOR_TEXT[kind];
}
