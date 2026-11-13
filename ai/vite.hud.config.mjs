// Builds the HUD bridge into ../web/ai/voice.js (one self-contained ES module for the browser).
// Fails if an agent id is set: voice.js is public, the HUD reads the id at runtime (?agent=).
import { defineConfig, loadEnv } from "vite";
import { assertNoBakedAgentId } from "./src/hud/noBakedAgentId.ts";

export default defineConfig(({ mode }) => {
  assertNoBakedAgentId(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    build: {
      lib: { entry: "src/hudBridge.ts", formats: ["es"], fileName: () => "voice.js" },
      outDir: "../web/ai",
      emptyOutDir: false,
      target: "es2020",
      minify: true,
    },
  };
});
