/**
 * HUD BRIDGE entry, built into `web/ai/voice.js` with `npm run build:hud`.
 * The HUD (web/hud/js/adapters.js) calls:
 *   toggleVoice()            start / stop talking (ignored while connecting)
 *   getConversation()        -> { sendContextualUpdate(text) }
 *   onAgentText(callback)    the agent's words + short visor error lines
 *   onUserText(callback)     the astronaut's transcribed words
 *   isListening()            true while connected
 *   askQuestion(text)        a question in words, sent the moment the agent connects
 *   getVoiceState()          'disconnected' | 'connecting' | 'connected'
 *
 * Live status comes from `window.hud.getStatus()`; location facts (`get_location_info`, which also
 * opens the info card on the visor) from `window.hud.placeInfo()`. The agent id is read at
 * runtime only (`?agent=<id>`, remembered on the phone); never at build time.
 */
import { VoiceAssistantService } from "./services/VoiceAssistantService";
import { HudStatusProvider } from "./providers/HudStatusProvider";
import { startElevenLabsVoiceSession } from "./adapters/elevenLabsVoiceSession";
import { requestBrowserMicrophone } from "./adapters/browserMicrophone";
import { createHudStatusReader, type HudWindowApi } from "./hud/hudStatusReader";
import { resolveRuntimeAgentId } from "./hud/runtimeAgentId";
import { HudVoiceBridge } from "./hud/HudVoiceBridge";
import { createGetLocationInfoTool, GET_LOCATION_INFO_TOOL_NAME } from "./voice/getLocationInfoTool";

function localStorageOrUndefined(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const hudWindow = window as Window & { hud?: HudWindowApi };

const bridge = new HudVoiceBridge(
  new VoiceAssistantService({
    agentId: resolveRuntimeAgentId(location.search, localStorageOrUndefined()),
    statusProvider: new HudStatusProvider({ getStatus: createHudStatusReader(() => hudWindow.hud) }),
    startSession: startElevenLabsVoiceSession,
    requestMicrophoneAccess: () => requestBrowserMicrophone(),
    clock: Date.now,
    extraTools: {
      [GET_LOCATION_INFO_TOOL_NAME]: createGetLocationInfoTool(() => hudWindow.hud?.placeInfo?.() ?? null),
    },
  }),
  console,
);

export const toggleVoice = () => bridge.toggleVoice();
export const getConversation = () => bridge.getConversation();
export const onAgentText = (callback: (text: string) => void) => bridge.onAgentText(callback);
export const onUserText = (callback: (text: string) => void) => bridge.onUserText(callback);
export const isListening = () => bridge.isListening();
export const askQuestion = (text: string) => bridge.askQuestion(text);
export const getVoiceState = () => bridge.getVoiceState();
