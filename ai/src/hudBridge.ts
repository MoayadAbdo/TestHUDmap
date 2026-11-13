/**
 * HUD BRIDGE entry, built into `web/ai/voice.js` with `npm run build:hud`.
 * The HUD (web/hud/js/adapters.js) calls:
 *   toggleVoice()            start / stop talking (ignored while connecting)
 *   getConversation()        -> { sendContextualUpdate(text) }
 *   onAgentText(callback)    the agent's words + short visor error lines
 *   onUserText(callback)     the astronaut's transcribed words
 *   isListening()            true while connected
 *   getVoiceState()          'disconnected' | 'connecting' | 'connected'
 *
 * Live status comes from `window.hud.getStatus()`. The agent id is read at
 * runtime only (`?agent=<id>`, remembered on the phone); never at build time.
 */
import { VoiceAssistantService } from "./services/VoiceAssistantService";
import { HudStatusProvider } from "./providers/HudStatusProvider";
import { startElevenLabsVoiceSession } from "./adapters/elevenLabsVoiceSession";
import { requestBrowserMicrophone } from "./adapters/browserMicrophone";
import { createHudStatusReader, type HudWindowApi } from "./hud/hudStatusReader";
import { resolveRuntimeAgentId } from "./hud/runtimeAgentId";
import { HudVoiceBridge } from "./hud/HudVoiceBridge";

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
  }),
  console,
);

export const toggleVoice = () => bridge.toggleVoice();
export const getConversation = () => bridge.getConversation();
export const onAgentText = (callback: (text: string) => void) => bridge.onAgentText(callback);
export const onUserText = (callback: (text: string) => void) => bridge.onUserText(callback);
export const isListening = () => bridge.isListening();
export const getVoiceState = () => bridge.getVoiceState();
