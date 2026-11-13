
export const AGENT_ID_STORAGE_KEY = "mars.agentId";

/**
 * The HUD reads the agent id only at runtime, never from the build:
 * `?agent=<id>` in the URL is saved on this phone, later visits reuse it.
 */
export function resolveRuntimeAgentId(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): string | undefined {
  const fromUrl = new URLSearchParams(search).get("agent")?.trim();
  if (fromUrl) {
    tryStorage(() => storage?.setItem(AGENT_ID_STORAGE_KEY, fromUrl));
    return fromUrl;
  }
  return tryStorage(() => storage?.getItem(AGENT_ID_STORAGE_KEY)?.trim()) || undefined;
}

/** Storage can throw (private mode, blocked cookies). The id then lasts only for this page. */
function tryStorage<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}
