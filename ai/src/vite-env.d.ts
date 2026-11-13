/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" (default) or "official". See docs/REPLACING_MOCK_DATA.md. */
  readonly VITE_MISSION_DATA_SOURCE?: string;
  /**
   * ElevenLabs PUBLIC agent ID, dev page only. VITE_ variables are embedded in
   * the browser bundle, so this must never be an API key or other secret.
   * build:hud refuses to run when it is set (the HUD uses ?agent= at runtime).
   */
  readonly VITE_ELEVENLABS_AGENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
