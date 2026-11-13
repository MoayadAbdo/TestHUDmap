
import { describe, it, expect, vi } from "vitest";
import { VoiceAssistantService } from "../src/services/VoiceAssistantService";
import { MockStatusProvider } from "../src/providers/MockStatusProvider";
import { HudVoiceBridge } from "../src/hud/HudVoiceBridge";
import { deferred, fakeClock, fakeVoiceSdk } from "./support/fakeVoiceSdk";

function setup({ agentId = "agent_test", microphone = async (): Promise<void> => undefined } = {}) {
  const sdk = fakeVoiceSdk();
  const assistant = new VoiceAssistantService({
    agentId,
    statusProvider: new MockStatusProvider(),
    startSession: sdk.startSession,
    requestMicrophoneAccess: microphone,
    clock: fakeClock().now,
  });
  const log = { warn: vi.fn() };
  const bridge = new HudVoiceBridge(assistant, log);
  const agentTexts: string[] = [];
  const userTexts: string[] = [];
  bridge.onAgentText((text) => agentTexts.push(text));
  bridge.onUserText((text) => userTexts.push(text));
  return { sdk, bridge, log, agentTexts, userTexts };
}

describe("HudVoiceBridge toggle and state", () => {
  it("a second toggle while connecting does not cancel the session being opened", async () => {
    const { sdk, bridge } = setup();
    const gate = deferred<void>();
    sdk.holdNextStart(gate.promise);

    const first = bridge.toggleVoice();
    await vi.waitFor(() => expect(sdk.startSession).toHaveBeenCalled());
    expect(bridge.getVoiceState()).toBe("connecting");
    expect(bridge.isListening()).toBe(false);

    await bridge.toggleVoice(); // double tap / wake word while connecting
    gate.resolve();
    await first;

    expect(sdk.startSession).toHaveBeenCalledOnce();
    expect(sdk.last().ended).toBe(false);
    expect(bridge.getVoiceState()).toBe("connected");
    expect(bridge.isListening()).toBe(true);
  });

  it("reports 'connecting' while waiting for the microphone too", async () => {
    const mic = deferred<void>();
    const { bridge } = setup({ microphone: () => mic.promise });
    const toggling = bridge.toggleVoice();
    expect(bridge.getVoiceState()).toBe("connecting");
    mic.resolve();
    await toggling;
    expect(bridge.getVoiceState()).toBe("connected");
  });

  it("toggle when connected ends the session", async () => {
    const { sdk, bridge } = setup();
    await bridge.toggleVoice();
    await bridge.toggleVoice();
    expect(sdk.last().ended).toBe(true);
    expect(bridge.getVoiceState()).toBe("disconnected");
    expect(bridge.isListening()).toBe(false);
  });

  it("forwards contextual updates to the open session", async () => {
    const { sdk, bridge } = setup();
    await bridge.toggleVoice();
    bridge.getConversation().sendContextualUpdate("The astronaut reached stop 2 of 5.");
    expect(sdk.last().contextUpdates).toEqual(["The astronaut reached stop 2 of 5."]);
  });
});

describe("HudVoiceBridge text", () => {
  it("sends user words to onUserText and agent words to onAgentText", async () => {
    const { sdk, bridge, agentTexts, userTexts } = setup();
    await bridge.toggleVoice();
    sdk.last().options.callbacks.onMessage({ role: "user", text: "How much oxygen?" });
    sdk.last().options.callbacks.onMessage({ role: "agent", text: "64 percent." });
    expect(userTexts).toEqual(["How much oxygen?"]);
    expect(agentTexts).toEqual(["64 percent."]);
  });

  it("stops calling a listener after it unsubscribes", async () => {
    const { sdk, bridge } = setup();
    const heard: string[] = [];
    const unsubscribe = bridge.onUserText((text) => heard.push(text));
    await bridge.toggleVoice();
    unsubscribe();
    sdk.last().options.callbacks.onMessage({ role: "user", text: "hello" });
    expect(heard).toEqual([]);
  });
});

describe("HudVoiceBridge visor errors", () => {
  it("missing agent id: short set-up hint on the visor", async () => {
    const { bridge, agentTexts } = setup({ agentId: "" });
    await bridge.toggleVoice();
    expect(agentTexts).toEqual(["AI not set up: open with ?agent=<id>"]);
  });

  it("connection failure: 'AI offline: no connection', details only in the console", async () => {
    const { sdk, bridge, agentTexts, log } = setup();
    sdk.failNextStart(new Error("WebSocket closed: 1006"));
    await bridge.toggleVoice();
    expect(agentTexts).toEqual(["AI offline: no connection"]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("WebSocket closed: 1006"));
  });

  it("microphone problem: 'AI offline: no microphone'", async () => {
    const { bridge, agentTexts } = setup({
      microphone: async () => {
        throw new Error("Microphone permission was denied.");
      },
    });
    await bridge.toggleVoice();
    expect(agentTexts).toEqual(["AI offline: no microphone"]);
  });

  it("model-facing tool errors never reach the visor", async () => {
    const { sdk, bridge, agentTexts, log } = setup();
    await bridge.toggleVoice();
    const toolError = "Client tool execution failed with following error: Do not estimate or invent oxygen";
    sdk.last().options.callbacks.onError(toolError);
    expect(agentTexts).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(toolError));
  });

  it("a dropped connection shows the short offline line", async () => {
    const { sdk, bridge, agentTexts } = setup();
    await bridge.toggleVoice();
    sdk.last().options.callbacks.onDisconnect({ reason: "error", message: "LiveKit room disconnected" });
    expect(agentTexts).toEqual(["AI offline: no connection"]);
    expect(bridge.getVoiceState()).toBe("disconnected");
  });
});
