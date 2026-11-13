import { describe, it, expect, vi } from "vitest";
import {
  createGetLocationInfoTool,
  GET_LOCATION_INFO_TOOL_NAME,
  toAgentLocationInfo,
} from "../src/voice/getLocationInfoTool";
import { VoiceAssistantService } from "../src/services/VoiceAssistantService";
import { MockStatusProvider } from "../src/providers/MockStatusProvider";
import { fakeVoiceSdk } from "./support/fakeVoiceSdk";

// the shape web/hud/js/core/place-info.js returns at stop 2
const AT_STOP_2 = {
  here: { height_m: 34, steep_pct: 61 },
  stop: { id: 2, name: "Steep ridge", distance_m: 6 },
  lines: [
    { kind: "stop", icon: "📍", text: "Near stop 2: Steep ridge (6 m)" },
    { kind: "curiosity", icon: "🔬", text: "Curiosity drilled a ridgetop in this area; X-ray analysis found clay minerals in the ridge." },
    { kind: "slope", icon: "⛰", text: "Very broken ground: 61% of this spot is steeper than 15°. Walk slowly." },
    { kind: "mineral", icon: "💧", text: "Orbit data hints at polyhydrated sulfates (stronger than 87% of the scene). They form with water; only spectra confirm it." },
  ],
  sources: ["MRO HiRISE 1 m heights and slope", "MRO CRISM FRT000058A3", "Mars Odyssey THEMIS"],
};

describe("get_location_info values", () => {
  it("gives the agent the place, the facts (without the stop line) and the sources", () => {
    const info = toAgentLocationInfo(AT_STOP_2)!;
    expect(info.place).toBe("near stop 2, Steep ridge");
    expect(info.near_stop).toEqual({ id: 2, name: "Steep ridge", distance_m: 6 });
    expect(info.facts).toHaveLength(3);
    expect(info.facts[0]).toMatch(/clay minerals/);
    expect(info.facts.join(" ")).not.toMatch(/Near stop/);
    expect(info.sources).toContain("MRO CRISM FRT000058A3");
    expect(info.rules).toMatch(/hints from orbit/);
  });

  it("says 'between stops' when no stop is near", () => {
    const info = toAgentLocationInfo({ ...AT_STOP_2, stop: null, lines: AT_STOP_2.lines.slice(1) })!;
    expect(info.place).toBe("between stops");
    expect(info.near_stop).toBeNull();
  });

  it("returns null for no data or no usable facts", () => {
    expect(toAgentLocationInfo(null)).toBeNull();
    expect(toAgentLocationInfo({ lines: [{ kind: "stop", text: "Near stop 1" }, { text: 42 }] })).toBeNull();
  });
});

describe("get_location_info tool", () => {
  it("calls the HUD (which opens the card) and returns JSON", async () => {
    const placeInfo = vi.fn(() => AT_STOP_2);
    const onResult = vi.fn();
    const result = JSON.parse(await createGetLocationInfoTool(placeInfo, { onResult })({}));
    expect(placeInfo).toHaveBeenCalledOnce();
    expect(result.facts[1]).toMatch(/steeper than 15/);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("fails with a 'don't guess' message when the position is unknown", async () => {
    await expect(createGetLocationInfoTool(() => null)({})).rejects.toThrow(/Do not guess/);
  });

  it("fails the same way when the HUD throws", async () => {
    const tool = createGetLocationInfoTool(() => { throw new Error("HUD not ready"); });
    await expect(tool({})).rejects.toThrow(/Do not guess.*HUD not ready/);
  });

  it("is registered next to get_status, which can't be replaced", async () => {
    const sdk = fakeVoiceSdk();
    const service = new VoiceAssistantService({
      agentId: "agent_test_123",
      statusProvider: new MockStatusProvider(),
      startSession: sdk.startSession,
      requestMicrophoneAccess: async () => undefined,
      extraTools: {
        [GET_LOCATION_INFO_TOOL_NAME]: createGetLocationInfoTool(() => AT_STOP_2),
        get_status: async () => "fake",
      },
    });
    await service.start();
    const tools = sdk.last().options.clientTools;
    expect(Object.keys(tools).sort()).toEqual(["get_location_info", "get_status"]);
    expect(await tools.get_status({})).not.toBe("fake");
  });
});
