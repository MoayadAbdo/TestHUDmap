
import type { StatusProvider } from "../contracts/MissionStatus";
import type { StartVoiceSession } from "../contracts/VoiceSession";
import { HudStatusProvider, type HudAdapter } from "../providers/HudStatusProvider";
import { MockStatusProvider } from "../providers/MockStatusProvider";
import { startElevenLabsVoiceSession } from "../adapters/elevenLabsVoiceSession";
import { requestBrowserMicrophone } from "../adapters/browserMicrophone";
import { VoiceAssistantService } from "../services/VoiceAssistantService";
import { MissionContextService } from "../services/MissionContextService";
import { MissionService } from "../services/MissionService";
import { StopCardService } from "../services/StopCardService";
import { createMissionDataServices } from "./missionDataConfig";

/**
 * APP COMPOSITION ROOT for the dev page (and the knowledge export).
 *
 * Wires live status, mission data and the voice assistant together. Swap
 * implementations here (or through `options`), never inside services.
 * The real HUD uses its own smaller wiring in `src/hudBridge.ts`.
 */
export interface AssistantAppOptions {
  /** The HUD team's adapter. When set, `HudStatusProvider` replaces the mock. */
  hud?: HudAdapter;
  /** Full override of the status source (takes precedence over `hud`). */
  statusProvider?: StatusProvider;
  agentId?: string;
  startSession?: StartVoiceSession;
  requestMicrophoneAccess?: () => Promise<void>;
}

export interface AssistantApp {
  statusProvider: StatusProvider;
  missionService: MissionService;
  stopCardService: StopCardService;
  missionContext: MissionContextService;
  voiceAssistant: VoiceAssistantService;
}

export function createStatusProvider(hud?: HudAdapter): StatusProvider {
  return hud ? new HudStatusProvider(hud) : new MockStatusProvider();
}

export function createAssistantApp(options: AssistantAppOptions = {}): AssistantApp {
  const statusProvider = options.statusProvider ?? createStatusProvider(options.hud);
  const { missionService, stopCardService } = createMissionDataServices();

  return {
    statusProvider,
    missionService,
    stopCardService,
    missionContext: new MissionContextService(statusProvider, missionService, stopCardService),
    voiceAssistant: new VoiceAssistantService({
      agentId: options.agentId ?? import.meta.env.VITE_ELEVENLABS_AGENT_ID,
      statusProvider,
      startSession: options.startSession ?? startElevenLabsVoiceSession,
      requestMicrophoneAccess: options.requestMicrophoneAccess ?? (() => requestBrowserMicrophone()),
      clock: Date.now,
    }),
  };
}
