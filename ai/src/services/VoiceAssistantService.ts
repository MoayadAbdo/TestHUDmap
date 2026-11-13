
import type { StatusProvider } from "../contracts/MissionStatus";
import type {
  StartVoiceSession,
  VoiceDisconnect,
  VoiceMode,
  VoiceRole,
  VoiceSession,
  VoiceSessionCallbacks,
} from "../contracts/VoiceSession";
import { createGetStatusTool, GET_STATUS_TOOL_NAME } from "../voice/getStatusTool";
import { MissionContextMemory } from "../voice/MissionContextMemory";
import { errorMessage } from "../utils/errorMessage";

export type VoiceConnectionState =
  | "disconnected"
  | "requesting-microphone"
  | "connecting"
  | "connected"
  | "disconnecting";

export type VoiceErrorKind = "configuration" | "microphone" | "connection" | "agent" | "tool";

export type VoiceAssistantEvent =
  | { type: "state"; state: VoiceConnectionState }
  | { type: "mode"; mode: VoiceMode }
  | { type: "transcript"; role: VoiceRole; text: string }
  | { type: "error"; kind: VoiceErrorKind; message: string }
  | { type: "disconnected"; details: VoiceDisconnect }
  | { type: "tool"; name: string; ok: boolean; detail: string }
  | { type: "context-sent"; text: string };

export type VoiceAssistantListener = (event: VoiceAssistantEvent) => void;

export interface VoiceAssistantDependencies {
  /** ElevenLabs public agent ID. */
  agentId: string | undefined;
  /** Live status source for `get_status`: MockStatusProvider today, HudStatusProvider later. */
  statusProvider: StatusProvider;
  startSession: StartVoiceSession;
  requestMicrophoneAccess: () => Promise<void>;
  statusTimeoutMs?: number;
  /** Clock for the age of re-sent mission context. Default: Date.now. */
  clock?: () => number;
  /** Re-sent mission context older than this is dropped. */
  contextMaxAgeMs?: number;
}

/**
 * Voice conversation lifecycle for the Mars Suit Assistant.
 *
 * - At most one session at a time. Repeated `start()` calls share the
 *   pending attempt.
 * - `stop()` is safe at any moment, including while the session is connecting.
 * - Callbacks from an old session are ignored, using a generation counter.
 * - Registers the `get_status` client tool on the injected `StatusProvider`.
 * - Forwards mission context (e.g. stop arrival) as contextual updates and
 *   re-sends the latest one, with its age, on a new connection (dropped when too old).
 *
 * Everything external (SDK, microphone, status source) is injected.
 */
export class VoiceAssistantService {
  private state: VoiceConnectionState = "disconnected";
  private session: VoiceSession | null = null;
  private pendingStart: { generation: number; promise: Promise<boolean> } | null = null;
  private generation = 0;
  private readonly context: MissionContextMemory;
  private readonly listeners = new Set<VoiceAssistantListener>();

  constructor(private readonly deps: VoiceAssistantDependencies) {
    this.context = new MissionContextMemory(deps.clock ?? Date.now, deps.contextMaxAgeMs);
  }

  getState(): VoiceConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === "connected" && this.session !== null;
  }

  subscribe(listener: VoiceAssistantListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start a voice conversation. Resolves `true` once connected, `false` if it failed or was cancelled. */
  start(): Promise<boolean> {
    if (this.session) return Promise.resolve(true);
    if (this.pendingStart && this.pendingStart.generation === this.generation) {
      return this.pendingStart.promise;
    }
    const generation = ++this.generation;
    const promise = this.connect(generation).finally(() => {
      if (this.pendingStart?.generation === generation) this.pendingStart = null;
    });
    this.pendingStart = { generation, promise };
    return promise;
  }

  /** End the current conversation, or cancel one that's still connecting. */
  async stop(): Promise<void> {
    const generation = ++this.generation; // invalidates pending starts and old-session callbacks
    this.pendingStart = null;
    const session = this.session;
    this.session = null;

    if (!session) {
      this.setState("disconnected");
      return;
    }
    this.setState("disconnecting");
    try {
      await session.endSession();
    } catch (error) {
      this.emitError("connection", `Error while ending the conversation: ${errorMessage(error)}`);
    } finally {
      // Don't overwrite the state of a new session started while this one was ending.
      if (this.isCurrent(generation)) this.setState("disconnected");
    }
  }

  /**
   * Tell the agent about mission context it can't see (e.g. "arrived at stop 3").
   * Also kept for the next connection (see MissionContextMemory).
   */
  updateMissionContext(text: string): void {
    this.context.remember(text);
    if (this.session) this.sendContext(this.session, text);
  }

  private async connect(generation: number): Promise<boolean> {
    const agentId = this.deps.agentId?.trim();
    if (!agentId) {
      this.setState("disconnected");
      this.emitError("configuration", "No ElevenLabs agent ID is set.");
      return false;
    }

    this.setState("requesting-microphone");
    try {
      await this.deps.requestMicrophoneAccess();
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.setState("disconnected");
        this.emitError("microphone", errorMessage(error));
      }
      return false;
    }
    if (!this.isCurrent(generation)) return false;

    this.setState("connecting");
    let session: VoiceSession;
    try {
      session = await this.deps.startSession({
        agentId,
        clientTools: { [GET_STATUS_TOOL_NAME]: this.createStatusTool() },
        callbacks: this.callbacksFor(generation),
      });
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.setState("disconnected");
        this.emitError("connection", `Could not connect to the ElevenLabs agent: ${errorMessage(error)}`);
      }
      return false;
    }

    if (!this.isCurrent(generation)) {
      // stop() was called or the connection dropped while connecting.
      await session.endSession().catch(() => undefined);
      return false;
    }

    this.session = session;
    this.setState("connected");
    const earlier = this.context.forNewSession();
    if (earlier) this.sendContext(session, earlier);
    return true;
  }

  private createStatusTool() {
    return createGetStatusTool(this.deps.statusProvider, {
      timeoutMs: this.deps.statusTimeoutMs,
      onResult: (result) =>
        this.emit({
          type: "tool",
          name: GET_STATUS_TOOL_NAME,
          ok: result.ok,
          detail: result.ok ? JSON.stringify(result.status) : result.error,
        }),
    });
  }

  private callbacksFor(generation: number): VoiceSessionCallbacks {
    const current = () => this.isCurrent(generation);
    return {
      onMessage: ({ role, text }) => {
        if (current()) this.emit({ type: "transcript", role, text });
      },
      onModeChange: (mode) => {
        if (current()) this.emit({ type: "mode", mode });
      },
      onError: (message) => {
        if (current()) this.emitError("agent", message);
      },
      onDisconnect: (details) => {
        if (!current()) return; // our own stop(), or an old session
        this.generation++;
        this.session = null;
        this.pendingStart = null;
        this.setState("disconnected");
        this.emit({ type: "disconnected", details });
        if (details.reason === "error") {
          this.emitError("connection", `Connection to the voice agent was lost: ${details.message}`);
        }
      },
    };
  }

  private sendContext(session: VoiceSession, text: string): void {
    try {
      session.sendContextualUpdate(text);
      this.emit({ type: "context-sent", text });
    } catch (error) {
      this.emitError("connection", `Could not send mission context: ${errorMessage(error)}`);
    }
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private setState(state: VoiceConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ type: "state", state });
  }

  private emitError(kind: VoiceErrorKind, message: string): void {
    this.emit({ type: "error", kind, message });
  }

  private emit(event: VoiceAssistantEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken UI listener must not break the voice session.
      }
    }
  }
}
