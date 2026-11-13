/** Fits the teammates' modules to the shapes the HUD uses. Returns null if a module doesn't fit. */

export function asLive(mod) {
  const live = mod.live ?? mod.default ?? mod;
  return typeof live?.sendTelemetry === 'function' ? live : null;
}

export function asSim(mod) {
  const sim = mod.sim ?? mod.default ?? mod;
  return typeof sim?.getPosition === 'function' && typeof sim?.getBackground === 'function' ? sim : null;
}

/**
 * T1.2 exposes toggleVoice() and a conversation with sendContextualUpdate().
 * Optional: onUserText(cb) (the astronaut's words) and getVoiceState() ('disconnected' | 'connecting' | 'connected').
 */
export function asVoice(mod) {
  if (typeof mod.toggleVoice !== 'function') return null;
  const conversation = () => mod.convo ?? mod.getConversation?.();
  const listening = () => Boolean(mod.isListening?.());
  return {
    toggle: () => mod.toggleVoice(),
    sendContext: (text) => conversation()?.sendContextualUpdate?.(text),
    onText: (callback) => (mod.onAgentText ?? mod.onText)?.(callback),
    onUserText: (callback) => mod.onUserText?.(callback),
    get listening() {
      return listening();
    },
    get state() {
      return mod.getVoiceState?.() ?? (listening() ? 'connected' : 'disconnected');
    },
  };
}
