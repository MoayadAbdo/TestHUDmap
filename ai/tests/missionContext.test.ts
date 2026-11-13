
import { describe, it, expect } from "vitest";
import { MissionContextService, describeNewTarget } from "../src/services/MissionContextService";
import { MissionService } from "../src/services/MissionService";
import { StopCardService } from "../src/services/StopCardService";
import { MissionStopCardProvider } from "../src/stopCards/MissionStopCardProvider";
import { MockMissionDataProvider } from "../src/providers/MockMissionDataProvider";
import { MockStatusProvider } from "../src/providers/MockStatusProvider";
import { SimulatedStatusProvider } from "../src/dev/SimulatedStatusProvider";

function setup() {
  const status = new SimulatedStatusProvider(new MockStatusProvider());
  const missionProvider = new MockMissionDataProvider();
  const context = new MissionContextService(
    status,
    new MissionService(missionProvider),
    new StopCardService(new MissionStopCardProvider(missionProvider)),
  );
  return { status, context };
}

describe("MissionContextService", () => {
  it("treats status.stop as the stop being walked to, not the current one", async () => {
    const { context } = setup();
    const snapshot = await context.refresh();
    expect(snapshot.targetStopId).toBe(2);
    expect(snapshot.targetCard?.title).toBe("Steep ridge");
    expect(snapshot.stopAfterTarget?.name).toBe("Boxwork Formation");
    expect(snapshot.statusError).toBeNull();
  });

  it("flags a change only when the target changes", async () => {
    const { context, status } = setup();
    expect((await context.refresh()).targetChanged).toBe(true);
    expect((await context.refresh()).targetChanged).toBe(false);

    status.simulateStop(3, "Boxwork Formation");
    const next = await context.refresh();
    expect(next.targetChanged).toBe(true);
    expect(next.targetCard?.stopId).toBe(3);
  });

  it("offline fallback: keeps showing the last known target card when status fails", async () => {
    const { context, status } = setup();
    await context.refresh();
    status.simulateOutage(true);

    const snapshot = await context.refresh();
    expect(snapshot.status).toBeNull(); // no stale or made-up live values
    expect(snapshot.statusError).toContain("Simulated HUD outage");
    expect(snapshot.targetStopId).toBe(2);
    expect(snapshot.targetCard?.title).toBe("Steep ridge");
    expect(snapshot.targetChanged).toBe(false);
  });

  it("reports an unknown stop without inventing a card", async () => {
    const { context, status } = setup();
    status.simulateStop(42, "Unknown");
    const snapshot = await context.refresh();
    expect(snapshot.targetCard).toBeUndefined();
    expect(describeNewTarget(snapshot)).toContain("No stop card is available");
  });

  it("returns nothing to show before any status has ever been received", async () => {
    const { context, status } = setup();
    status.simulateOutage(true);
    const snapshot = await context.refresh();
    expect(snapshot.targetStopId).toBeNull();
    expect(describeNewTarget(snapshot)).toBeNull();
  });

  it("stop 0 means walking back to base: no stop card", async () => {
    const { context, status } = setup();
    status.simulateStop(0, "Base");
    const snapshot = await context.refresh();
    expect(snapshot.targetCard).toBeUndefined();
    expect(snapshot.stopCardError).toBeNull();
    expect(describeNewTarget(snapshot)).toBe("The astronaut is now walking back to base.");
  });
});

describe("describeNewTarget", () => {
  it("describes the stop ahead from its card and marks mock data", async () => {
    const { context } = setup();
    const text = describeNewTarget(await context.refresh())!;
    expect(text).toContain("now walking to stop 2: Steep ridge");
    expect(text).not.toContain("arrived");
    expect(text).toContain("Planned tasks there: Observe ridge structures; Document visible patterns");
    expect(text).toContain("After that: stop 3, Boxwork Formation");
    expect(text).toContain("MOCK demonstration data");
    expect(text).toContain("call get_status");
    expect(text).not.toMatch(/\d+\s*%|µSv|°C/); // no live values copied in
  });

  it("notes the last stop", async () => {
    const { context, status } = setup();
    status.simulateStop(3, "Boxwork Formation");
    expect(describeNewTarget(await context.refresh())).toContain("This is the last planned stop.");
  });
});
