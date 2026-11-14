
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ElevenLabs SDK: no network, microphone or audio in tests.
const sdk = vi.hoisted(() => {
  const conversation = {
    getId: vi.fn(() => "conv_abc"),
    sendContextualUpdate: vi.fn(),
    sendUserMessage: vi.fn(),
    endSession: vi.fn(async () => undefined),
  };
  return { conversation, startSession: vi.fn(async (_options: Record<string, any>) => conversation) };
});
vi.mock("@elevenlabs/client", () => ({ Conversation: { startSession: sdk.startSession } }));

import { startElevenLabsVoiceSession } from "../src/adapters/elevenLabsVoiceSession";
import { requestBrowserMicrophone } from "../src/adapters/browserMicrophone";
import { createAssistantApp } from "../src/config/appComposition";
import { MockStatusProvider } from "../src/providers/MockStatusProvider";
import type { VoiceSessionCallbacks } from "../src/contracts/VoiceSession";

const sdkOptions = () => sdk.startSession.mock.calls.at(-1)![0];

function callbacks(): VoiceSessionCallbacks & Record<string, ReturnType<typeof vi.fn>> {
  return { onMessage: vi.fn(), onModeChange: vi.fn(), onError: vi.fn(), onDisconnect: vi.fn() } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("ElevenLabs SDK adapter", () => {
  it("starts a public-agent voice session with the client tools", async () => {
    const getStatus = vi.fn(async () => "{}");
    const session = await startElevenLabsVoiceSession({
      agentId: "agent_x",
      clientTools: { get_status: getStatus },
      callbacks: callbacks(),
    });

    expect(sdk.startSession).toHaveBeenCalledOnce();
    const options = sdkOptions();
    expect(options.agentId).toBe("agent_x");
    expect(options.textOnly).toBe(false);
    expect(options.clientTools.get_status).toBe(getStatus);
    expect(options).not.toHaveProperty("signedUrl");
    expect(options).not.toHaveProperty("conversationToken");
    expect(session.id).toBe("conv_abc");
  });

  it("maps SDK callbacks to the voice session port", async () => {
    const cb = callbacks();
    await startElevenLabsVoiceSession({ agentId: "a", clientTools: {}, callbacks: cb });
    const options = sdkOptions();

    options.onMessage({ message: "hello", role: "user", source: "user", event_id: 1 });
    options.onMessage({ message: "hi astronaut", role: "agent", source: "ai", event_id: 2 });
    options.onModeChange({ mode: "speaking" });
    options.onError("boom", {});
    options.onDisconnect({ reason: "error", message: "closed", context: { type: "close" } });
    options.onDisconnect({ reason: "user" });

    expect(cb.onMessage).toHaveBeenNthCalledWith(1, { role: "user", text: "hello" });
    expect(cb.onMessage).toHaveBeenNthCalledWith(2, { role: "agent", text: "hi astronaut" });
    expect(cb.onModeChange).toHaveBeenCalledWith("speaking");
    expect(cb.onError).toHaveBeenCalledWith("boom");
    expect(cb.onDisconnect).toHaveBeenNthCalledWith(1, { reason: "error", message: "closed" });
    expect(cb.onDisconnect).toHaveBeenNthCalledWith(2, { reason: "user" });
  });

  it("delegates contextual updates and endSession to the SDK conversation", async () => {
    const session = await startElevenLabsVoiceSession({ agentId: "a", clientTools: {}, callbacks: callbacks() });
    session.sendContextualUpdate("Arrived at stop 3");
    session.sendUserMessage("What's here?");
    await session.endSession();
    expect(sdk.conversation.sendContextualUpdate).toHaveBeenCalledWith("Arrived at stop 3");
    expect(sdk.conversation.sendUserMessage).toHaveBeenCalledWith("What's here?");
    expect(sdk.conversation.endSession).toHaveBeenCalledOnce();
  });

  it("propagates SDK connection failures", async () => {
    sdk.startSession.mockRejectedValueOnce(new Error("agent not found"));
    await expect(
      startElevenLabsVoiceSession({ agentId: "bad", clientTools: {}, callbacks: callbacks() }),
    ).rejects.toThrow("agent not found");
  });
});

describe("end-to-end with the mocked SDK", () => {
  it("SDK calling get_status receives MockStatusProvider JSON", async () => {
    const { voiceAssistant } = createAssistantApp({
      agentId: "agent_e2e",
      requestMicrophoneAccess: async () => undefined,
    });
    await expect(voiceAssistant.start()).resolves.toBe(true);

    // Simulate ElevenLabs invoking the client tool.
    const result = await sdkOptions().clientTools.get_status({});
    expect(JSON.parse(result)).toEqual(await new MockStatusProvider().getStatus());

    await voiceAssistant.stop();
    expect(sdk.conversation.endSession).toHaveBeenCalledOnce();
  });

  it("injecting a HUD adapter switches get_status to HUD data", async () => {
    const hud = { getStatus: () => ({ ...MOCK_LIKE, o2_pct: 12, must_return: true }) };
    const { voiceAssistant } = createAssistantApp({
      hud,
      agentId: "agent_e2e",
      requestMicrophoneAccess: async () => undefined,
    });
    await voiceAssistant.start();
    const result = JSON.parse(await sdkOptions().clientTools.get_status({}));
    expect(result.o2_pct).toBe(12);
    expect(result.must_return).toBe(true);
  });
});

const MOCK_LIKE = {
  stop: 1,
  stop_name: "Observation Point",
  dist_next_m: 100,
  dist_base_m: 100,
  o2_pct: 90,
  o2_minutes_left: 300,
  must_return: false,
  rad_uSv_h: 20,
  temp_c: -50,
};

describe("browser microphone permission", () => {
  const media = (impl: () => Promise<unknown>) => ({ getUserMedia: vi.fn(impl) }) as never;
  const domError = (name: string) => Object.assign(new Error(name), { name });

  it("stops the probe stream once permission is granted", async () => {
    const stop = vi.fn();
    await requestBrowserMicrophone(media(async () => ({ getTracks: () => [{ stop }] })));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("explains a denied permission", async () => {
    await expect(requestBrowserMicrophone(media(async () => Promise.reject(domError("NotAllowedError"))))).rejects.toThrow(
      /permission was denied/,
    );
  });

  it("explains a missing microphone", async () => {
    await expect(requestBrowserMicrophone(media(async () => Promise.reject(domError("NotFoundError"))))).rejects.toThrow(
      /No microphone was found/,
    );
  });

  it("explains an unavailable media API (insecure context)", async () => {
    await expect(requestBrowserMicrophone(undefined)).rejects.toThrow(/HTTPS or http:\/\/localhost/);
  });
});
