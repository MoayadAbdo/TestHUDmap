
import type { MissionStatus, StatusProvider } from "../contracts/MissionStatus";

/**
 * DEV ONLY. Wraps a real StatusProvider so the dev page can simulate
 * walking to another stop, or a HUD outage. Every other field comes from
 * the wrapped provider unchanged.
 * Not used in production wiring. The HUD provides real stop changes.
 */
export class SimulatedStatusProvider implements StatusProvider {
  private stopOverride: { stop: number; stop_name: string } | null = null;
  private failing = false;

  constructor(private readonly inner: StatusProvider) {}

  simulateStop(stop: number, stopName: string): void {
    this.stopOverride = { stop, stop_name: stopName };
  }

  clearStopOverride(): void {
    this.stopOverride = null;
  }

  simulateOutage(failing: boolean): void {
    this.failing = failing;
  }

  async getStatus(): Promise<MissionStatus> {
    if (this.failing) throw new Error("Simulated HUD outage");
    const status = await this.inner.getStatus();
    return this.stopOverride ? { ...status, ...this.stopOverride } : status;
  }
}
