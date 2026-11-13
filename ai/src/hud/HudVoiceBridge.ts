
import type { VoiceAssistantEvent, VoiceAssistantService } from "../services/VoiceAssistantService";
import { visorErrorText } from "./visorErrorText";

export type HudVoiceState = "disconnected" | "connecting" | "connected";

export type HudVoiceAssistant = Pick<
  VoiceAssistantService,
  "getState" | "start" | "stop" | "isConnected" | "updateMissionContext" | "subscribe"
>;

type TextCallback = (text: string) => void;

/** The voice assistant in the shape the HUD (web/hud/js/adapters.js) calls. */
export class HudVoiceBridge {
  constructor(
    private readonly assistant: HudVoiceAssistant,
    private readonly log: Pick<Console, "warn">,
  ) {
    assistant.subscribe((event) => {
      if (event.type === "error") log.warn(`[voice] ${event.kind} error: ${event.message}`);
    });
  }

  /** Start or stop talking. Ignored while a session is opening or closing, so a double tap can't cancel it. */
  async toggleVoice(): Promise<void> {
    const state = this.assistant.getState();
    if (state === "disconnected") await this.assistant.start();
    else if (state === "connected") await this.assistant.stop();
  }

  getConversation(): { sendContextualUpdate(text: string): void } {
    return { sendContextualUpdate: (text) => this.assistant.updateMissionContext(text) };
  }

  /** The agent's words, plus short error lines for the visor. */
  onAgentText(callback: TextCallback): () => void {
    return this.assistant.subscribe((event) => {
      const text = agentText(event);
      if (text) callback(text);
    });
  }

  /** The astronaut's words once transcribed (lets the HUD count speech as activity). */
  onUserText(callback: TextCallback): () => void {
    return this.assistant.subscribe((event) => {
      if (event.type === "transcript" && event.role === "user") callback(event.text);
    });
  }

  /** True only while a session is connected. */
  isListening(): boolean {
    return this.assistant.isConnected();
  }

  getVoiceState(): HudVoiceState {
    switch (this.assistant.getState()) {
      case "connected":
        return "connected";
      case "requesting-microphone":
      case "connecting":
        return "connecting";
      default:
        return "disconnected";
    }
  }
}

function agentText(event: VoiceAssistantEvent): string | null {
  if (event.type === "transcript" && event.role === "agent") return event.text;
  if (event.type === "error") return visorErrorText(event.kind, event.message);
  return null;
}
