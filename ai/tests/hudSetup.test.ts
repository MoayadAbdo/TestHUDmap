
import { describe, it, expect } from "vitest";
import { AGENT_ID_STORAGE_KEY, resolveRuntimeAgentId } from "../src/hud/runtimeAgentId";
import { createHudStatusReader } from "../src/hud/hudStatusReader";
import { assertNoBakedAgentId } from "../src/hud/noBakedAgentId";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const brokenStorage = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

describe("runtime agent id", () => {
  it("takes ?agent= from the URL and remembers it on the phone", () => {
    const storage = memoryStorage();
    expect(resolveRuntimeAgentId("?agent=agent_abc&wake=0", storage)).toBe("agent_abc");
    expect(storage.items.get(AGENT_ID_STORAGE_KEY)).toBe("agent_abc");
  });

  it("reuses the remembered id when the URL has none", () => {
    const storage = memoryStorage({ [AGENT_ID_STORAGE_KEY]: "agent_saved" });
    expect(resolveRuntimeAgentId("", storage)).toBe("agent_saved");
    expect(resolveRuntimeAgentId("?agent=", storage)).toBe("agent_saved");
  });

  it("a new ?agent= replaces the remembered one", () => {
    const storage = memoryStorage({ [AGENT_ID_STORAGE_KEY]: "agent_old" });
    expect(resolveRuntimeAgentId("?agent=agent_new", storage)).toBe("agent_new");
    expect(storage.items.get(AGENT_ID_STORAGE_KEY)).toBe("agent_new");
  });

  it("is undefined when nothing is set", () => {
    expect(resolveRuntimeAgentId("", memoryStorage())).toBeUndefined();
    expect(resolveRuntimeAgentId("", undefined)).toBeUndefined();
  });

  it("still works for this page when storage is blocked", () => {
    expect(resolveRuntimeAgentId("?agent=agent_abc", brokenStorage)).toBe("agent_abc");
    expect(resolveRuntimeAgentId("", brokenStorage)).toBeUndefined();
  });
});

describe("HUD status reader", () => {
  const HUD = {
    stop: 2,
    stop_name: "Steep ridge",
    dist_next_m: 41,
    dist_base_m: 410,
    o2_pct: 82,
    o2_minutes_left: null,
    must_return: false,
    rad_uSv_h: null,
    temp_c: -48,
  };

  it("passes the HUD values through", () => {
    expect(createHudStatusReader(() => ({ getStatus: () => HUD }))()).toEqual(HUD);
  });

  it("stop null (walking back to base) becomes stop 0", () => {
    const read = createHudStatusReader(() => ({ getStatus: () => ({ ...HUD, stop: null, stop_name: "Base" }) }));
    expect(read()).toMatchObject({ stop: 0, stop_name: "Base" });
  });

  it("fails clearly before the HUD is ready", () => {
    expect(createHudStatusReader(() => undefined)).toThrow("HUD status is not ready yet");
    expect(createHudStatusReader(() => ({ getStatus: () => null }))).toThrow("HUD status is not ready yet");
  });
});

describe("build:hud agent id guard", () => {
  it("allows a build with no agent id", () => {
    expect(() => assertNoBakedAgentId({})).not.toThrow();
    expect(() => assertNoBakedAgentId({ VITE_ELEVENLABS_AGENT_ID: "  " })).not.toThrow();
  });

  it("stops the build when an agent id is set", () => {
    expect(() => assertNoBakedAgentId({ VITE_ELEVENLABS_AGENT_ID: "agent_abc" })).toThrow(
      /public web\/ai\/voice\.js.*\?agent=<id>/,
    );
  });
});
