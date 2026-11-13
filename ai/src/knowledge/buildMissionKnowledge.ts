
import type { MissionData, StopCard } from "../contracts/MissionData";

/**
 * Render mission data and stop cards as plain text for the ElevenLabs Knowledge
 * Base. It's deterministic: the same input always gives byte-identical output
 * (no timestamps), so regenerated files can be diffed.
 *
 * The text comes from the normalized model, so stop details are never typed
 * in by hand in more than one place.
 */
export function buildMissionKnowledgeText(
  mission: MissionData,
  stopCards: StopCard[],
): string {
  const lines: string[] = [];
  const isMock = mission.source === "mock";

  if (isMock) {
    lines.push(
      "*** MOCK / DEMONSTRATION DATA ***",
      "This document contains FICTIONAL placeholder mission data for development.",
      "It is NOT official NASA or mission-planning data.",
      "If asked, tell the astronaut that the official stop cards have not been provided yet.",
      "",
    );
  }

  lines.push(
    isMock ? "MISSION PLAN (MOCK)" : "MISSION PLAN",
    `Mission: ${mission.missionName}`,
    `Mission ID: ${mission.missionId}`,
    `Location: ${mission.location}`,
    `Number of planned stops: ${mission.stops.length}`,
    `Planned stop order: ${mission.stops.map((s) => `${s.id}. ${s.name}`).join(" -> ")}`,
    "",
    isMock ? "STOP CARDS (MOCK)" : "STOP CARDS",
    "",
  );

  for (const card of stopCards) {
    lines.push(`STOP ${card.stopId}: ${card.title}`, card.description);
    if (card.tasks.length > 0) {
      lines.push("Planned tasks:", ...card.tasks.map((task) => `- ${task}`));
    } else {
      lines.push("Planned tasks: none listed.");
    }
    lines.push("");
  }

  lines.push(
    "LIVE STATUS",
    "This document does not contain live values. For the stop being walked to, distances,",
    "oxygen, radiation, temperature and return-to-base decisions, use the get_status tool.",
  );

  return lines.join("\n") + "\n";
}
