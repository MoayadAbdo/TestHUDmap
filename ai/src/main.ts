
/**
 * DEVELOPMENT CONSOLE for the Mars Suit Assistant.
 * A minimal test page. The real interface will be the team's HUD, which
 * uses the same services through `createAssistantApp()`.
 */
import { createAssistantApp } from "./config/appComposition";
import { MockStatusProvider } from "./providers/MockStatusProvider";
import { SimulatedStatusProvider } from "./dev/SimulatedStatusProvider";
import { describeNewTarget, type MissionSnapshot } from "./services/MissionContextService";
import type { MissionStatus } from "./contracts/MissionStatus";
import type { VoiceAssistantEvent } from "./services/VoiceAssistantService";

const STATUS_POLL_MS = 3000;

// Dev wiring: mock status wrapped so stops/outages can be simulated.
// For the real HUD: createAssistantApp({ hud }) and drop the simulator.
const simulated = new SimulatedStatusProvider(new MockStatusProvider());
const app = createAssistantApp({ statusProvider: simulated });
const { voiceAssistant, missionContext, missionService, stopCardService } = app;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  connection: $("connection"),
  start: $<HTMLButtonElement>("start"),
  stop: $<HTMLButtonElement>("stop"),
  voiceError: $("voice-error"),
  transcript: $("transcript"),
  transcriptEmpty: $("transcript-empty"),
  offlineBanner: $("offline-banner"),
  stopCard: $("stop-card"),
  status: $("status"),
  statusError: $("status-error"),
  statusSource: $("status-source"),
  simStop: $<HTMLSelectElement>("sim-stop"),
  simOutage: $<HTMLInputElement>("sim-outage"),
  events: $("events"),
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function append(list: HTMLElement, item: HTMLElement): void {
  list.append(item);
  list.scrollTop = list.scrollHeight;
}

function logEvent(text: string, isError = false): void {
  const time = new Date().toLocaleTimeString();
  append(ui.events, el("li", `${time}  ${text}`, isError ? "event error" : "event"));
}

// ---- Voice assistant ------------------------------------------------------

function renderConnection(): void {
  const state = voiceAssistant.getState();
  ui.connection.dataset.state = state;
  ui.connection.textContent = state.replace("-", " ");
  const busy = state !== "disconnected";
  ui.start.disabled = busy;
  ui.stop.disabled = state === "disconnected" || state === "disconnecting";
  ui.offlineBanner.hidden = state === "connected";
}

voiceAssistant.subscribe((event: VoiceAssistantEvent) => {
  switch (event.type) {
    case "state":
      renderConnection();
      if (event.state === "connected") {
        ui.voiceError.hidden = true;
        ui.connection.dataset.error = "false";
      }
      logEvent(`state → ${event.state}`);
      break;
    case "mode":
      ui.connection.textContent = `connected · ${event.mode}`;
      break;
    case "transcript": {
      ui.transcriptEmpty.hidden = true;
      const item = el("li", undefined, event.role);
      item.append(el("span", event.role === "user" ? "You" : "Assistant", "role"), event.text);
      append(ui.transcript, item);
      break;
    }
    case "error":
      ui.voiceError.hidden = false;
      ui.voiceError.textContent = `${event.kind} error: ${event.message}`;
      ui.connection.dataset.error = "true";
      logEvent(`${event.kind} error: ${event.message}`, true);
      break;
    case "disconnected":
      logEvent(`session ended (reason: ${event.details.reason})`);
      break;
    case "tool":
      logEvent(`${event.name} ${event.ok ? "ok" : "FAILED"}: ${event.detail}`, !event.ok);
      break;
    case "context-sent":
      logEvent(`contextual update sent: ${event.text}`);
      break;
  }
});

ui.start.addEventListener("click", () => {
  ui.voiceError.hidden = true;
  void voiceAssistant.start();
});
ui.stop.addEventListener("click", () => void voiceAssistant.stop());
window.addEventListener("beforeunload", () => void voiceAssistant.stop());

// ---- Mission status and stop card (works without ElevenLabs) ----------------

const shown = (value: unknown, unit = "") => (value === null || value === undefined ? "unknown" : `${value}${unit}`);

const STATUS_ROWS: [keyof MissionStatus, string, (v: MissionStatus) => string][] = [
  ["stop", "Walking to", (s) => `${shown(s.stop)} · ${shown(s.stop_name)}`],
  ["o2_pct", "Oxygen", (s) => `${s.o2_pct}% (${shown(s.o2_minutes_left, " min")} left)`],
  ["dist_next_m", "To that stop", (s) => shown(s.dist_next_m, " m")],
  ["dist_base_m", "To base", (s) => shown(s.dist_base_m, " m")],
  ["rad_uSv_h", "Radiation", (s) => shown(s.rad_uSv_h, " µSv/h")],
  ["temp_c", "Temperature", (s) => shown(s.temp_c, " °C")],
  ["must_return", "Must return", (s) => (s.must_return ? "YES, RETURN TO BASE" : "no")],
];

function renderStatus(snapshot: MissionSnapshot): void {
  ui.statusError.hidden = snapshot.statusError === null;
  ui.statusError.textContent = snapshot.statusError
    ? `Live status unavailable: ${snapshot.statusError}. No values are shown rather than stale or estimated ones.`
    : "";
  ui.status.replaceChildren();
  if (!snapshot.status) return;
  for (const [key, label, format] of STATUS_ROWS) {
    const value = el("dd", format(snapshot.status));
    if (key === "must_return" && snapshot.status.must_return) value.className = "alert";
    ui.status.append(el("dt", label), value);
  }
}

function renderStopCard(snapshot: MissionSnapshot): void {
  const root = ui.stopCard;
  root.replaceChildren();
  if (snapshot.stopCardError) {
    root.append(el("p", `Stop card unavailable: ${snapshot.stopCardError}`, "alert"));
    return;
  }
  if (snapshot.targetStopId === null) {
    root.append(el("p", "Stop ahead unknown (no status received yet).", "muted"));
    return;
  }
  const card = snapshot.targetCard;
  if (!card) {
    root.append(el("p", `No stop card for stop ${snapshot.targetStopId}.`, "muted"));
    return;
  }
  const title = el("h3", `Stop ${card.stopId}: ${card.title} `);
  title.style.margin = "0 0 6px";
  if (card.source === "mock") title.append(el("span", "MOCK DATA", "badge"));
  root.append(title, el("p", card.description));
  const tasks = el("ul", undefined, "tasks");
  card.tasks.forEach((task) => tasks.append(el("li", task)));
  root.append(el("strong", "Planned tasks"), tasks);
  root.append(
    el(
      "p",
      snapshot.stopAfterTarget
        ? `After that: ${snapshot.stopAfterTarget.id}. ${snapshot.stopAfterTarget.name}`
        : "Last planned stop.",
      "muted",
    ),
  );
}

let refreshing = false;
async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const snapshot = await missionContext.refresh();
    renderStatus(snapshot);
    renderStopCard(snapshot);
    if (snapshot.targetChanged) {
      logEvent(`astronaut now walking to stop ${snapshot.targetStopId}`);
      const text = describeNewTarget(snapshot);
      if (text) voiceAssistant.updateMissionContext(text);
    }
  } finally {
    refreshing = false;
  }
}

async function initDevControls(): Promise<void> {
  ui.statusSource.textContent = "(MockStatusProvider, simulated)";
  const mission = await missionService.getMission();
  ui.simStop.append(el("option", "(mock status default)"));
  ui.simStop.options[0].value = "";
  for (const stop of mission.stops) {
    const option = el("option", `${stop.id}. ${stop.name}`);
    option.value = String(stop.id);
    ui.simStop.append(option);
  }
  ui.simStop.addEventListener("change", () => {
    const stop = mission.stops.find((s) => String(s.id) === ui.simStop.value);
    if (stop) simulated.simulateStop(stop.id, stop.name);
    else simulated.clearStopOverride();
    void refresh();
  });
  ui.simOutage.addEventListener("change", () => {
    simulated.simulateOutage(ui.simOutage.checked);
    void refresh();
  });
}

async function boot(): Promise<void> {
  renderConnection();
  try {
    await stopCardService.preload(); // stop cards cached locally from here on
    await initDevControls();
  } catch (error) {
    logEvent(`mission data failed to load: ${error instanceof Error ? error.message : String(error)}`, true);
  }
  await refresh();
  setInterval(() => void refresh(), STATUS_POLL_MS);
  if (!import.meta.env.VITE_ELEVENLABS_AGENT_ID) {
    logEvent("VITE_ELEVENLABS_AGENT_ID is not set (put it in .env.development.local). Voice will not start.", true);
  }
}

void boot();
