
import type { VoiceErrorKind } from "../services/VoiceAssistantService";

const VISOR_TEXT: Record<VoiceErrorKind, string | null> = {
  configuration: "AI not set up: open with ?agent=<id>",
  microphone: "AI offline: no microphone",
  connection: "AI offline: no connection",
  // Agent and tool errors are meant for the model (the agent still answers): console only.
  agent: null,
  tool: null,
};

/** Short text for the astronaut's visor, or null when the error should stay in the console. */
export function visorErrorText(kind: VoiceErrorKind): string | null {
  return VISOR_TEXT[kind];
}
