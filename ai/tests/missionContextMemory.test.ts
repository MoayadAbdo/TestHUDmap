
import { describe, it, expect } from "vitest";
import { DEFAULT_CONTEXT_MAX_AGE_MS, MissionContextMemory } from "../src/voice/MissionContextMemory";
import { fakeClock } from "./support/fakeVoiceSdk";

const MINUTE = 60_000;

describe("MissionContextMemory", () => {
  it("has nothing to send before any update", () => {
    expect(new MissionContextMemory(fakeClock().now).forNewSession()).toBeNull();
  });

  it("adds the age in whole minutes", () => {
    const clock = fakeClock();
    const memory = new MissionContextMemory(clock.now);
    memory.remember("Reached stop 2.");
    clock.advance(59_000);
    expect(memory.forNewSession()).toBe("Earlier update, under a minute ago: Reached stop 2.");
    clock.advance(3 * MINUTE);
    expect(memory.forNewSession()).toBe("Earlier update, 3 min ago: Reached stop 2.");
  });

  it("keeps an update up to the max age, then drops it for good", () => {
    const clock = fakeClock();
    const memory = new MissionContextMemory(clock.now, 5 * MINUTE);
    memory.remember("Reached stop 2.");
    clock.advance(5 * MINUTE);
    expect(memory.forNewSession()).not.toBeNull();
    clock.advance(1);
    expect(memory.forNewSession()).toBeNull();
    expect(memory.forNewSession()).toBeNull();
  });

  it("a newer update replaces the older one", () => {
    const clock = fakeClock();
    const memory = new MissionContextMemory(clock.now);
    memory.remember("Reached stop 1.");
    clock.advance(DEFAULT_CONTEXT_MAX_AGE_MS);
    memory.remember("Reached stop 2.");
    expect(memory.forNewSession()).toBe("Earlier update, under a minute ago: Reached stop 2.");
  });
});
