
import { vi } from "vitest";
import type { StartVoiceSession, VoiceSession, VoiceSessionOptions } from "../../src/contracts/VoiceSession";

export interface FakeSession extends VoiceSession {
  ended: boolean;
  contextUpdates: string[];
  options: VoiceSessionOptions;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Fake voice SDK port. `holdNextStart` lets a test control when a connect finishes. */
export function fakeVoiceSdk() {
  const sessions: FakeSession[] = [];
  let nextStart: Promise<void> | null = null;
  let failWith: Error | null = null;

  const startSession = vi.fn<StartVoiceSession>(async (options) => {
    if (nextStart) await nextStart;
    if (failWith) throw failWith;
    const session: FakeSession = {
      id: `conv-${sessions.length + 1}`,
      ended: false,
      contextUpdates: [],
      options,
      sendContextualUpdate(text) {
        this.contextUpdates.push(text);
      },
      async endSession() {
        this.ended = true;
      },
    };
    sessions.push(session);
    return session;
  });

  return {
    startSession,
    sessions,
    holdNextStart(gate: Promise<void> | null) {
      nextStart = gate;
    },
    failNextStart(error: Error | null) {
      failWith = error;
    },
    last: () => sessions[sessions.length - 1],
  };
}

/** A clock the test moves by hand. */
export function fakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}
