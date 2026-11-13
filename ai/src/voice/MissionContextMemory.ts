
export const DEFAULT_CONTEXT_MAX_AGE_MS = 10 * 60_000;

const MINUTE_MS = 60_000;

/**
 * Keeps the latest mission update so a new voice session can hear it.
 * It is re-sent with its age, and dropped once it is older than `maxAgeMs`.
 */
export class MissionContextMemory {
  private latest: { text: string; at: number } | null = null;

  constructor(
    private readonly now: () => number,
    private readonly maxAgeMs: number = DEFAULT_CONTEXT_MAX_AGE_MS,
  ) {}

  remember(text: string): void {
    this.latest = { text, at: this.now() };
  }

  /** Text for a new session, or null when there is nothing recent. */
  forNewSession(): string | null {
    if (!this.latest) return null;
    const ageMs = this.now() - this.latest.at;
    if (ageMs > this.maxAgeMs) {
      this.latest = null;
      return null;
    }
    return `Earlier update, ${describeAge(ageMs)}: ${this.latest.text}`;
  }
}

function describeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / MINUTE_MS);
  return minutes < 1 ? "under a minute ago" : `${minutes} min ago`;
}
