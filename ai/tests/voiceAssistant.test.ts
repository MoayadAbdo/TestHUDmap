
import { describe, it, expect, vi } from "vitest";
import type { MissionStatus, StatusProvider } from "../src/contracts/MissionStatus";
import {
  VoiceAssistantService,
  type VoiceAssistantDependencies,
  type VoiceAssistantEvent,
} from "../src/services/VoiceAssistantService";
import { MockStatusProvider } from "../src/providers/MockStatusProvider";
import { HudStatusProvider } from "../src/providers/HudStatusProvider";
import { StatusUnavailableError } from "../src/voice/getStatusTool";
import { deferred, fakeClock, fakeVoiceSdk, type FakeSession } from "./support/fakeVoiceSdk";

function setup(overrides: Partial<VoiceAssistantDependencies> = {}) {
  const sdk = fakeVoiceSdk();
  const clock = fakeClock();
  const requestMicrophoneAccess = vi.fn(async () => undefined);
  const service = new VoiceAssistantService({
    agentId: "agent_test_123",
    statusProvider: new MockStatusProvider(),
    startSession: sdk.startSession,
    requestMicrophoneAccess,
    clock: clock.now,
    ...overrides,
  });
  const events: VoiceAssistantEvent[] = [];
  service.subscribe((e) => events.push(e));
  const states = () => events.flatMap((e) => (e.type === "state" ? [e.state] : []));
  const errors = () => events.flatMap((e) => (e.type === "error" ? [e] : []));
  return { service, sdk, clock, requestMicrophoneAccess, events, states, errors };
}

const getStatusTool = (session: FakeSession) => session.options.clientTools["get_status"];

// ---- Conversation lifecycle ------------------------------------------------

describe("VoiceAssistantService lifecycle", () => {
  it("requests the microphone, connects with the agent ID and reports state", async () => {
    const { service, sdk, requestMicrophoneAccess, states } = setup();

    await expect(service.start()).resolves.toBe(true);

    expect(requestMicrophoneAccess).toHaveBeenCalledOnce();
    expect(sdk.startSession).toHaveBeenCalledOnce();
    expect(sdk.last().options.agentId).toBe("agent_test_123");
    expect(states()).toEqual(["requesting-microphone", "connecting", "connected"]);
    expect(service.isConnected()).toBe(true);
  });

  it("prevents duplicate concurrent sessions", async () => {
    const { service, sdk } = setup();
    const results = await Promise.all([service.start(), service.start(), service.start()]);
    await service.start(); // already connected

    expect(results).toEqual([true, true, true]);
    expect(sdk.startSession).toHaveBeenCalledOnce();
    expect(sdk.sessions).toHaveLength(1);
  });

  it("ends the session and cleans up on stop()", async () => {
    const { service, sdk, states } = setup();
    await service.start();
    await service.stop();

    expect(sdk.last().ended).toBe(true);
    expect(service.getState()).toBe("disconnected");
    expect(service.isConnected()).toBe(false);
    expect(states().slice(-2)).toEqual(["disconnecting", "disconnected"]);
  });

  it("can start a new session after stopping", async () => {
    const { service, sdk } = setup();
    await service.start();
    await service.stop();
    await service.start();
    expect(sdk.sessions).toHaveLength(2);
    expect(sdk.sessions[0].ended).toBe(true);
    expect(sdk.sessions[1].ended).toBe(false);
  });

  it("stop() while connecting cancels the attempt and closes the late session", async () => {
    const { service, sdk } = setup();
    const gate = deferred<void>();
    sdk.holdNextStart(gate.promise);

    const starting = service.start();
    await vi.waitFor(() => expect(sdk.startSession).toHaveBeenCalled());
    await service.stop();
    gate.resolve();

    await expect(starting).resolves.toBe(false);
    expect(sdk.last().ended).toBe(true);
    expect(service.getState()).toBe("disconnected");
  });

  it("stop() is a no-op when nothing is running", async () => {
    const { service, events } = setup();
    await service.stop();
    expect(service.getState()).toBe("disconnected");
    expect(events).toEqual([]);
  });

  it("ignores events from a session that has already been stopped", async () => {
    const { service, sdk, events } = setup();
    await service.start();
    const old = sdk.last();
    await service.stop();
    events.length = 0;

    old.options.callbacks.onMessage({ role: "agent", text: "stale" });
    old.options.callbacks.onDisconnect({ reason: "error", message: "stale" });
    expect(events).toEqual([]);
  });

  it("emits user and assistant transcripts and mode changes", async () => {
    const { service, sdk, events } = setup();
    await service.start();
    const { callbacks } = sdk.last().options;

    callbacks.onMessage({ role: "user", text: "What is my oxygen level?" });
    callbacks.onModeChange("speaking");
    callbacks.onMessage({ role: "agent", text: "Your oxygen is at 82 percent." });

    expect(events.filter((e) => e.type === "transcript" || e.type === "mode")).toEqual([
      { type: "transcript", role: "user", text: "What is my oxygen level?" },
      { type: "mode", mode: "speaking" },
      { type: "transcript", role: "agent", text: "Your oxygen is at 82 percent." },
    ]);
  });
});

// ---- Errors -----------------------------------------------------------------

describe("VoiceAssistantService errors", () => {
  it("refuses to start without an agent ID", async () => {
    const { service, sdk, requestMicrophoneAccess, errors } = setup({ agentId: "  " });
    await expect(service.start()).resolves.toBe(false);
    expect(errors()[0].kind).toBe("configuration");
    expect(errors()[0].message).toMatch(/agent ID/);
    expect(requestMicrophoneAccess).not.toHaveBeenCalled();
    expect(sdk.startSession).not.toHaveBeenCalled();
  });

  it("reports a denied microphone and does not connect", async () => {
    const { service, sdk, errors } = setup({
      requestMicrophoneAccess: async () => {
        throw new Error("Microphone permission was denied.");
      },
    });
    await expect(service.start()).resolves.toBe(false);
    expect(errors()).toEqual([
      { type: "error", kind: "microphone", message: "Microphone permission was denied." },
    ]);
    expect(sdk.startSession).not.toHaveBeenCalled();
    expect(service.getState()).toBe("disconnected");
  });

  it("reports connection failures and allows retrying", async () => {
    const { service, sdk, errors } = setup();
    sdk.failNextStart(new Error("WebSocket closed: 1006"));
    await expect(service.start()).resolves.toBe(false);
    expect(errors()[0].kind).toBe("connection");
    expect(errors()[0].message).toContain("WebSocket closed: 1006");
    expect(service.getState()).toBe("disconnected");

    sdk.failNextStart(null);
    await expect(service.start()).resolves.toBe(true);
  });

  it("handles the connection dropping mid-conversation", async () => {
    const { service, sdk, events, errors } = setup();
    await service.start();
    sdk.last().options.callbacks.onDisconnect({ reason: "error", message: "network lost" });

    expect(service.getState()).toBe("disconnected");
    expect(service.isConnected()).toBe(false);
    expect(events).toContainEqual({ type: "disconnected", details: { reason: "error", message: "network lost" } });
    expect(errors().at(-1)?.message).toContain("network lost");
    await expect(service.start()).resolves.toBe(true);
    expect(sdk.sessions).toHaveLength(2);
  });

  it("treats an agent-ended conversation as a normal disconnect", async () => {
    const { service, sdk, errors } = setup();
    await service.start();
    sdk.last().options.callbacks.onDisconnect({ reason: "agent" });
    expect(service.getState()).toBe("disconnected");
    expect(errors()).toEqual([]);
  });

  it("surfaces SDK errors without crashing on a throwing listener", async () => {
    const { service, sdk, errors } = setup();
    service.subscribe(() => {
      throw new Error("broken UI");
    });
    await service.start();
    sdk.last().options.callbacks.onError("Client tool execution failed");
    expect(errors().at(-1)).toEqual({ type: "error", kind: "agent", message: "Client tool execution failed" });
  });
});

// ---- get_status client tool -------------------------------------------------

describe("get_status client tool", () => {
  it("is registered with the exact name get_status", async () => {
    const { service, sdk } = setup();
    await service.start();
    expect(Object.keys(sdk.last().options.clientTools)).toEqual(["get_status"]);
  });

  it("returns MockStatusProvider status as JSON", async () => {
    const { service, sdk, events } = setup();
    await service.start();

    const result = await getStatusTool(sdk.last())({});
    expect(JSON.parse(result)).toEqual(await new MockStatusProvider().getStatus());
    expect(events).toContainEqual(expect.objectContaining({ type: "tool", name: "get_status", ok: true }));
  });

  it("uses an injected HudStatusProvider without any service change", async () => {
    const hudStatus: MissionStatus = {
      stop: 3,
      stop_name: "Boxwork Formation",
      dist_next_m: 0,
      dist_base_m: 950,
      o2_pct: 41,
      o2_minutes_left: 120,
      must_return: true,
      rad_uSv_h: 31,
      temp_c: -72,
    };
    const { service, sdk } = setup({
      statusProvider: new HudStatusProvider({ getStatus: () => hudStatus }),
    });
    await service.start();
    expect(JSON.parse(await getStatusTool(sdk.last())({}))).toEqual(hudStatus);
  });

  it("reads fresh status on every call", async () => {
    let o2 = 80;
    const provider: StatusProvider = {
      getStatus: async () => ({ ...(await new MockStatusProvider().getStatus()), o2_pct: o2-- }),
    };
    const { service, sdk } = setup({ statusProvider: provider });
    await service.start();
    const tool = getStatusTool(sdk.last());
    expect(JSON.parse(await tool({})).o2_pct).toBe(80);
    expect(JSON.parse(await tool({})).o2_pct).toBe(79);
  });

  it("fails safely when the status provider throws, without inventing values", async () => {
    const { service, sdk, events } = setup({
      statusProvider: { getStatus: async () => Promise.reject(new Error("HUD offline")) },
    });
    await service.start();

    const call = getStatusTool(sdk.last())({});
    await expect(call).rejects.toBeInstanceOf(StatusUnavailableError);
    await expect(call).rejects.toThrow(/HUD offline.*Do not estimate or invent/);
    const toolEvent = events.find((e) => e.type === "tool");
    expect(toolEvent).toMatchObject({ ok: false });
  });

  it("times out a hanging status provider", async () => {
    const { service, sdk } = setup({
      statusProvider: { getStatus: () => new Promise<MissionStatus>(() => undefined) },
      statusTimeoutMs: 20,
    });
    await service.start();
    await expect(getStatusTool(sdk.last())({})).rejects.toThrow(/timed out after 20 ms/);
  });

  it("rejects malformed status data instead of passing it to the agent", async () => {
    const { service, sdk } = setup({
      statusProvider: {
        getStatus: async () =>
          ({ ...(await new MockStatusProvider().getStatus()), o2_pct: Number.NaN, must_return: "no" }) as never,
      },
    });
    await service.start();
    await expect(getStatusTool(sdk.last())({})).rejects.toThrow(/invalid or missing fields: o2_pct, must_return/);
  });
});

// ---- Mission context (contextual updates) -----------------------------------

describe("mission contextual updates", () => {
  const MINUTE = 60_000;

  it("sends context immediately while connected, without an age", async () => {
    const { service, sdk } = setup();
    await service.start();
    service.updateMissionContext("Arrived at stop 3");
    expect(sdk.last().contextUpdates).toEqual(["Arrived at stop 3"]);
  });

  it("sends the latest offline context on connect, with its age", async () => {
    const { service, sdk, clock } = setup();
    service.updateMissionContext("Arrived at stop 1");
    service.updateMissionContext("Arrived at stop 2");
    clock.advance(3 * MINUTE);
    await service.start();
    expect(sdk.last().contextUpdates).toEqual(["Earlier update, 3 min ago: Arrived at stop 2"]);
  });

  it("drops context older than the max age instead of re-sending it", async () => {
    const { service, sdk, clock } = setup({ contextMaxAgeMs: 5 * MINUTE });
    service.updateMissionContext("Arrived at stop 2");
    clock.advance(6 * MINUTE);
    await service.start();
    expect(sdk.last().contextUpdates).toEqual([]);
  });

  it("resends the latest context after reconnecting", async () => {
    const { service, sdk } = setup();
    await service.start();
    service.updateMissionContext("Arrived at stop 2");
    sdk.last().options.callbacks.onDisconnect({ reason: "error", message: "drop" });
    await service.start();
    expect(sdk.last().contextUpdates).toEqual(["Earlier update, under a minute ago: Arrived at stop 2"]);
  });
});
