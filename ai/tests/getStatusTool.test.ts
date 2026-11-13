
import { describe, it, expect } from "vitest";
import { createGetStatusTool, StatusUnavailableError, toAgentStatus } from "../src/voice/getStatusTool";

const HUD_STATUS = {
  stop: 3,
  stop_name: "Hollow",
  dist_next_m: 120,
  dist_base_m: 430,
  o2_pct: 64.5,
  o2_minutes_left: 210,
  must_return: false,
  rad_uSv_h: 27.9,
  temp_c: -44,
};

describe("get_status values", () => {
  it("passes a full HUD status through unchanged, in HUD field order", () => {
    const status = toAgentStatus(HUD_STATUS);
    expect(status).toEqual(HUD_STATUS);
    expect(Object.keys(status)).toEqual(Object.keys(HUD_STATUS));
  });

  it("turns missing optional readings into 'unknown' instead of failing", () => {
    const status = toAgentStatus({
      ...HUD_STATUS,
      rad_uSv_h: null,
      temp_c: null,
      o2_minutes_left: Infinity,
      dist_next_m: Number.NaN,
      stop_name: "",
      stop: undefined,
    });
    expect(status).toMatchObject({
      stop: "unknown",
      stop_name: "unknown",
      dist_next_m: "unknown",
      o2_minutes_left: "unknown",
      rad_uSv_h: "unknown",
      temp_c: "unknown",
      o2_pct: 64.5,
      must_return: false,
    });
  });

  it.each([
    ["o2_pct", { o2_pct: null }],
    ["o2_pct", { o2_pct: Infinity }],
    ["must_return", { must_return: null }],
    ["must_return", { must_return: "no" }],
  ])("still fails when %s is not valid", (field, change) => {
    expect(() => toAgentStatus({ ...HUD_STATUS, ...change })).toThrow(
      new RegExp(`invalid or missing fields: ${field}`),
    );
  });

  it("the tool returns the unknown values as JSON for the agent", async () => {
    const tool = createGetStatusTool({ getStatus: async () => ({ ...HUD_STATUS, temp_c: null }) });
    expect(JSON.parse(await tool({})).temp_c).toBe("unknown");
  });

  it("the tool fails with StatusUnavailableError when there is no status", async () => {
    const tool = createGetStatusTool({ getStatus: async () => null as never });
    await expect(tool({})).rejects.toBeInstanceOf(StatusUnavailableError);
  });
});

describe("newer HUD fields", () => {
  it("passes the return reason, walk home and dose to the agent when the HUD sends them", async () => {
    const { toAgentStatus } = await import("../src/voice/getStatusTool");
    const s = toAgentStatus({ o2_pct: 90, must_return: true, return_reason: "Solar storm: radiation rising", walk_home_min: 6, rad_dose_uSv: 10.3 });
    expect(s.return_reason).toBe("Solar storm: radiation rising");
    expect(s.walk_home_min).toBe(6);
    expect(s.rad_dose_uSv).toBe(10.3);
  });
});
