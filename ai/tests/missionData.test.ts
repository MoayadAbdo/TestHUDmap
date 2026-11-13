
import { describe, it, expect } from "vitest";
import type {
  MissionData,
  MissionDataProvider,
  StopCard,
  StopCardProvider,
} from "../src/contracts/MissionData";
import {
  normalizeMissionData,
  MissionDataValidationError,
} from "../src/adapters/missionDataAdapter";
import { MockMissionDataProvider } from "../src/providers/MockMissionDataProvider";
import { JsonMissionDataProvider } from "../src/providers/JsonMissionDataProvider";
import { MockStatusProvider } from "../src/providers/MockStatusProvider";
import {
  MissionStopCardProvider,
  buildStopCards,
} from "../src/stopCards/MissionStopCardProvider";
import { MissionService } from "../src/services/MissionService";
import { StopCardService } from "../src/services/StopCardService";
import { buildMissionKnowledgeText } from "../src/knowledge/buildMissionKnowledge";
import {
  createMissionDataProvider,
  createMissionDataServices,
  resolveMissionDataSource,
} from "../src/config/missionDataConfig";

/** A fixture with the mock-shaped raw schema, used to build alternative providers. */
function rawMission(overrides: Record<string, unknown> = {}) {
  return {
    mission_id: "test-mission",
    mission_name: "Test Mission",
    location: "Test Site",
    stops: [
      { id: 10, name: "Alpha", description: "First.", tasks: ["Task A"] },
      { id: 20, name: "Beta", description: "Second.", tasks: [] },
    ],
    ...overrides,
  };
}

function expectIssues(raw: unknown, ...fragments: string[]) {
  try {
    normalizeMissionData(raw, { source: "official" });
  } catch (error) {
    expect(error).toBeInstanceOf(MissionDataValidationError);
    const issues = (error as MissionDataValidationError).issues.join("\n");
    for (const fragment of fragments) expect(issues).toContain(fragment);
    return;
  }
  throw new Error("expected normalizeMissionData to throw");
}

describe("Mock mission data", () => {
  it("loads successfully", async () => {
    const mission = await new MockMissionDataProvider().getMission();
    expect(mission.missionId).toBe("mars-boxwork-demo");
    expect(mission.stops).toHaveLength(3);
  });

  it("matches the normalized structure and is flagged as mock", async () => {
    const mission = await new MockMissionDataProvider().getMission();
    expect(mission).toEqual({
      missionId: "mars-boxwork-demo",
      missionName: "Mount Sharp Boxwork Exploration",
      location: "Mount Sharp, Mars",
      source: "mock",
      stops: [
        {
          id: 1,
          name: "Observation Point",
          description: "Demo observation area.",
          tasks: ["Observe surrounding rock formations", "Take photographs"],
        },
        {
          id: 2,
          name: "Steep ridge",
          description: "Demo location for geological observations.",
          tasks: ["Observe ridge structures", "Document visible patterns"],
        },
        {
          id: 3,
          name: "Boxwork Formation",
          description: "Demo location for studying boxwork.",
          tasks: ["Observe intersecting ridges", "Record geological observations"],
        },
      ],
    } satisfies MissionData);
  });

  it("is consistent with the mock live status (walking to stop 2 = Steep ridge)", async () => {
    const status = await new MockStatusProvider().getStatus();
    const stop = await new MissionService(new MockMissionDataProvider()).getStop(status.stop ?? -1);
    expect(stop?.name).toBe(status.stop_name);
  });
});

describe("Stop cards", () => {
  const service = () =>
    new StopCardService(new MissionStopCardProvider(new MockMissionDataProvider()));

  it("retrieves a stop card by stop ID", async () => {
    const card = await service().getStopCard(3);
    expect(card).toEqual({
      stopId: 3,
      title: "Boxwork Formation",
      description: "Demo location for studying boxwork.",
      tasks: ["Observe intersecting ridges", "Record geological observations"],
      missionId: "mars-boxwork-demo",
      source: "mock",
    } satisfies StopCard);
  });

  it("returns undefined for an unknown stop ID", async () => {
    const s = service();
    await expect(s.getStopCard(99)).resolves.toBeUndefined();
    await expect(s.getStopCard(-1)).resolves.toBeUndefined();
    await expect(s.getStopCard(Number.NaN)).resolves.toBeUndefined();
  });

  it("is consistent with mission data", async () => {
    const mission = await new MockMissionDataProvider().getMission();
    const cards = await service().getAllStopCards();
    expect(cards.map((c) => c.stopId)).toEqual(mission.stops.map((s) => s.id));
    for (const stop of mission.stops) {
      const card = cards.find((c) => c.stopId === stop.id)!;
      expect(card.title).toBe(stop.name);
      expect(card.description).toBe(stop.description);
      expect(card.tasks).toEqual(stop.tasks);
      expect(card.source).toBe(mission.source);
    }
  });

  it("does not share task arrays with the mission model", async () => {
    const mission = await new MockMissionDataProvider().getMission();
    const [card] = buildStopCards(mission);
    card.tasks.push("mutated");
    expect(mission.stops[0].tasks).not.toContain("mutated");
  });

  it("stays available after the source becomes unreachable (offline fallback)", async () => {
    let online = true;
    const flaky: StopCardProvider = {
      async getStopCards() {
        if (!online) throw new Error("network down");
        return buildStopCards(normalizeMissionData(rawMission(), { source: "official" }));
      },
    };
    const s = new StopCardService(flaky);
    await s.preload();
    online = false;
    await expect(s.getStopCard(10)).resolves.toMatchObject({ title: "Alpha" });
  });
});

describe("Dependency injection", () => {
  it("application services work with an injected MissionDataProvider", async () => {
    const fake: MissionDataProvider = {
      getMission: async () => ({
        missionId: "fake",
        missionName: "Fake",
        location: "Nowhere",
        source: "official",
        stops: [{ id: 7, name: "Seven", description: "d", tasks: ["t"] }],
      }),
    };
    const missionService = new MissionService(fake);
    expect((await missionService.getStop(7))?.name).toBe("Seven");
    expect(await missionService.isMockData()).toBe(false);
  });

  it("swapping the mock provider for another provider needs no business-logic change", async () => {
    const providers: MissionDataProvider[] = [
      new MockMissionDataProvider(),
      new JsonMissionDataProvider(() => rawMission()),
      new JsonMissionDataProvider(async () => rawMission()), // e.g. a fetch()
    ];
    for (const provider of providers) {
      const missionService = new MissionService(provider);
      const stopCards = new StopCardService(new MissionStopCardProvider(provider));
      const mission = await missionService.getMission();
      const first = mission.stops[0];
      const second = mission.stops[1];
      expect((await missionService.getNextStop(first.id))?.id).toBe(second.id);
      expect((await stopCards.getStopCard(first.id))?.title).toBe(first.name);
    }
  });

  it("composition root defaults to mock and wires all services", async () => {
    expect(resolveMissionDataSource("")).toBe("mock");
    expect(resolveMissionDataSource("mock")).toBe("mock");
    expect(resolveMissionDataSource("official")).toBe("official");
    expect(() => resolveMissionDataSource("prod")).toThrow(/Invalid VITE_MISSION_DATA_SOURCE/);

    const { missionService, stopCardService } = createMissionDataServices("mock");
    expect(await missionService.isMockData()).toBe(true);
    expect((await stopCardService.getStopCard(1))?.title).toBe("Observation Point");
  });

  it("official mode fails clearly while mission.json is missing", async () => {
    await expect(createMissionDataProvider("official", {}).getMission()).rejects.toThrow(
      /src\/data\/mission\.json was not found/,
    );
  });

  it("official mode loads mission.json through the adapter when present", async () => {
    const files = { "../data/mission.json": rawMission() };
    const mission = await createMissionDataProvider("official", files).getMission();
    expect(mission.source).toBe("official");
    expect(mission.stops.map((s) => s.id)).toEqual([10, 20]);
  });

  it("provider retries after a failed load instead of caching the error", async () => {
    let calls = 0;
    const provider = new JsonMissionDataProvider(() => {
      calls++;
      if (calls === 1) throw new Error("temporary failure");
      return rawMission();
    });
    await expect(provider.getMission()).rejects.toThrow("temporary failure");
    await expect(provider.getMission()).resolves.toMatchObject({ missionId: "test-mission" });
  });
});

describe("Validation at the data boundary", () => {
  it("rejects non-object input", () => {
    expectIssues(null, "(root): expected a JSON object, got null");
    expectIssues([], "(root): expected a JSON object, got array");
    expectIssues("mission", "(root): expected a JSON object, got string");
  });

  it("rejects missing required fields with clear paths", () => {
    const { mission_name, ...noName } = rawMission();
    void mission_name;
    expectIssues(noName, "mission_name: required field is missing");
    expectIssues(rawMission({ stops: undefined }), "stops: required field is missing");
    expectIssues(
      rawMission({ stops: [{ id: 1, name: "X", tasks: [] }] }),
      "stops[0].description: required field is missing",
    );
  });

  it("rejects wrongly typed or empty values", () => {
    expectIssues(rawMission({ location: 42 }), "location: expected a non-empty string, got number");
    expectIssues(rawMission({ mission_id: "  " }), "mission_id: expected a non-empty string");
    expectIssues(rawMission({ stops: "many" }), "stops: expected an array, got string");
    expectIssues(
      rawMission({ stops: [{ id: 1.5, name: "X", description: "d", tasks: [3] }] }),
      "stops[0].id: expected an integer, got number",
      "stops[0].tasks[0]: expected a non-empty string, got number",
    );
  });

  it("rejects structurally invalid missions", () => {
    expectIssues(rawMission({ stops: [] }), "at least one stop");
    const dup = { id: 1, name: "X", description: "d", tasks: [] };
    expectIssues(rawMission({ stops: [dup, dup] }), "stops[1].id: duplicate stop id 1");
    expectIssues(rawMission({ stops: [{ ...dup, id: 0 }] }), "must be a positive integer");
  });

  it("rejects mock-flagged data loaded as official", () => {
    expectIssues(rawMission({ is_mock: true }), "is_mock");
  });

  it("reports all issues at once and never invents defaults", () => {
    try {
      normalizeMissionData({ stops: [{}] }, { source: "official" });
      throw new Error("should have thrown");
    } catch (error) {
      const { issues } = error as MissionDataValidationError;
      expect(issues).toEqual([
        "mission_id: required field is missing",
        "mission_name: required field is missing",
        "location: required field is missing",
        "stops[0].id: required field is missing",
        "stops[0].name: required field is missing",
        "stops[0].description: required field is missing",
        "stops[0].tasks: required field is missing",
      ]);
    }
  });

  it("provider surfaces validation errors", async () => {
    const provider = new JsonMissionDataProvider(() => ({ mission_id: "x" }));
    await expect(provider.getMission()).rejects.toBeInstanceOf(MissionDataValidationError);
  });
});

describe("Knowledge base export", () => {
  it("is generated from mission data, marked MOCK, and deterministic", async () => {
    const mission = await new MockMissionDataProvider().getMission();
    const cards = buildStopCards(mission);
    const text = buildMissionKnowledgeText(mission, cards);
    expect(text).toContain("MOCK / DEMONSTRATION DATA");
    for (const stop of mission.stops) expect(text).toContain(`STOP ${stop.id}: ${stop.name}`);
    expect(buildMissionKnowledgeText(mission, cards)).toBe(text);
  });

  it("omits the mock banner for official data", () => {
    const mission = normalizeMissionData(rawMission(), { source: "official" });
    const text = buildMissionKnowledgeText(mission, buildStopCards(mission));
    expect(text).not.toContain("MOCK");
    expect(text).toContain("Planned tasks: none listed.");
    expect(text).toContain("For the stop being walked to");
  });
});
