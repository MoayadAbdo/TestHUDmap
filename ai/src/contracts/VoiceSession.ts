
/**
 * Port between the voice assistant's business logic and the voice SDK.
 *
 * `VoiceAssistantService` depends only on these types. The ElevenLabs
 * implementation lives in `src/adapters/elevenLabsVoiceSession.ts`. Tests
 * substitute a fake.
 */

export type VoiceRole = "user" | "agent";
export type VoiceMode = "speaking" | "listening";

export type VoiceDisconnect =
  | { reason: "user" }
  | { reason: "agent" }
  | { reason: "error"; message: string };

/** A client tool returns a string result. Throwing reports the failure to the agent. */
export type ClientToolHandler = (parameters: unknown) => Promise<string>;

export interface VoiceSessionCallbacks {
  onMessage(message: { role: VoiceRole; text: string }): void;
  onModeChange(mode: VoiceMode): void;
  onError(message: string): void;
  onDisconnect(details: VoiceDisconnect): void;
}

export interface VoiceSessionOptions {
  agentId: string;
  clientTools: Record<string, ClientToolHandler>;
  callbacks: VoiceSessionCallbacks;
}

export interface VoiceSession {
  readonly id: string;
  sendContextualUpdate(text: string): void;
  /** Send a question as if the astronaut had said it (the words said right after "Hey suit"). */
  sendUserMessage(text: string): void;
  endSession(): Promise<void>;
}

/** Opens a voice session. Resolves once connected; rejects if the connection fails. */
export type StartVoiceSession = (options: VoiceSessionOptions) => Promise<VoiceSession>;
