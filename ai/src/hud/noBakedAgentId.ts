
export const AGENT_ID_ENV = "VITE_ELEVENLABS_AGENT_ID";

/**
 * build:hud writes web/ai/voice.js, which is committed to a public repo.
 * Stop the build if an agent id could be baked into it.
 */
export function assertNoBakedAgentId(env: Record<string, string | undefined>): void {
  if (!env[AGENT_ID_ENV]?.trim()) return;
  throw new Error(
    `${AGENT_ID_ENV} is set, so build:hud would bake the agent id into the public web/ai/voice.js. ` +
      `Remove it from your shell and from .env / .env.local / .env.hud*. ` +
      `For the dev page put it in .env.development.local; the HUD takes it at runtime from ?agent=<id>.`,
  );
}
