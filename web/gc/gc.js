// Ground Control (T1.5): watch the astronaut live, follow them on the Mars map, send messages and events.
// Listens on both links at once: the laptop's local link (when server/server.mjs serves this page) and
// PeerJS with the room code. If both bring phone data, the local link wins (link-choice.js).
import { createDelayedView } from "./delayed-view.js";
import { createDrive } from "./drive.js";
import { createLinkChoice } from "./link-choice.js";
import { startLocalLink } from "./local-link.js";
import { createPeerLink } from "./peer-link.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mjpeg = $("mjpeg"), video = $("video"), snap = $("snap"), noVideo = $("noVideo");
let lastAlerts = new Set(), local = null;

// ---------- log ----------
function log(text, kind = "info") {
  const li = document.createElement("li");
  li.className = kind;
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $("log").prepend(li);
}
function setPill(id, text, kind) { const el = $(id); el.textContent = text; el.className = `pill ${kind}`; }

// ---------- Mars delay ----------
const delayMs = () => ($("delayOn").checked ? Number($("delaySec").value) * 1000 : 0);
const later = (fn) => { const d = delayMs(); d ? setTimeout(fn, d) : fn(); };

// ---------- map ----------
const mission = await (await fetch("../mission/mission.json")).json();
const hirise = mission.layers.find((l) => l.id === "hirise")?.tiles;
const map = L.map("map", { crs: L.CRS.EPSG4326, zoomControl: true, attributionControl: true })
  .setView(mission.anchor.mars, 16);
L.tileLayer(hirise, { maxNativeZoom: 16, maxZoom: 18, attribution: "NASA/JPL/UArizona HiRISE · Mars Trek" }).addTo(map);
L.polyline(mission.route.map((p) => p.mars ?? [p.lat, p.lon]), { color: "#ffb54a", weight: 3, opacity: 0.9 }).addTo(map);
for (const s of mission.stops) {
  L.circleMarker(s.mars, { radius: 7, color: s.is_base ? "#4ade80" : "#22d3ee", fillOpacity: 0.85 })
    .bindTooltip(`${s.id} · ${s.name}`, { permanent: true, direction: "right", className: "" }).addTo(map);
}
const trail = L.polyline([], { color: "#22d3ee", weight: 2, dashArray: "4 4" }).addTo(map);
const astro = L.marker(mission.anchor.mars, { icon: L.divIcon({ className: "", html: '<div class="astro"></div>', iconSize: [18, 18] }) }).addTo(map);
let followed = false;

// ---------- incoming data ----------
function onTelemetry(t) {
  $("o2").textContent = t.o2_pct != null ? `${t.o2_pct}%` : "—";
  $("rad").textContent = t.rad_dose_uSv ?? "—";
  const stop = mission.stops.find((s) => s.id === t.stop && !s.is_base);
  $("stop").textContent = stop ? stop.name : t.stop == null ? "Base" : `#${t.stop}`;
  $("dnext").textContent = t.dist_next_m != null ? `${t.dist_next_m} m` : "—";
  $("dbase").textContent = t.dist_base_m != null ? `${t.dist_base_m} m` : "—";
  $("heading").textContent = t.heading != null ? `${t.heading}°` : "—";
  $("viewMode").textContent = { field: "· camera", sim: "· 3D simulation" }[t.mode] ?? "";
  if (t.mars) {
    astro.setLatLng(t.mars);
    trail.addLatLng(t.mars);
    if (!followed) { map.panTo(t.mars); followed = true; }
  }
  const now = new Set(t.alerts ?? []);
  for (const a of now) if (!lastAlerts.has(a)) log(`ALERT ${a.replaceAll("_", " ")}`, "alert");
  lastAlerts = now;
}
const choice = createLinkChoice();
function onPhoneData(source, msg) {
  if (!msg || typeof msg !== "object" || !choice.accept(source)) return;
  if (msg.type === "snap" && !(video.videoWidth > 0)) snap.src = msg.data;   // live; the delayed view delays it
  later(() => {
    if (msg.type === "telemetry") onTelemetry(msg);
    if (msg.type === "hello") log(`Linked to astronaut (room ${msg.room})`, "info");
  });
}

// ---------- the picture: local MJPEG, else PeerJS video, else PeerJS snapshots ----------
function liveElement() {
  if (local?.phoneOnline) return mjpeg;
  if (video.videoWidth > 0) return video;
  if (snap.getAttribute("src")) return snap;
  return null;
}
function showView() {
  const el = liveElement();
  for (const e of [mjpeg, video, snap]) e.style.display = e === el ? "block" : "none";
  noVideo.style.display = el ? "none" : "flex";
}
const SOURCE = { local: ["data: local link", "on"], peer: ["data: room code (PeerJS)", "on"] };
setInterval(() => {
  showView();
  setPill("source", ...(SOURCE[choice.current()] ?? ["no phone data", "off"]));
}, 1000);
showView();
// with Mars delay on, the picture is delayed too
const delayedView = createDelayedView({ screen: document.querySelector(".screen"), output: $("delayed"), label: $("delayLabel"), live: liveElement });

// ---------- links ----------
const peerLink = createPeerLink({
  onData: (msg) => onPhoneData("peer", msg),
  onStream: (stream) => { video.srcObject = stream; video.play().catch(() => {}); },
  onStatus: (text, kind) => setPill("link", text, kind),
  hasVideo: () => video.videoWidth > 0,
  log,
});
function join(code) {
  peerLink.connect(code);
  const room = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (room) { params.set("room", room); history.replaceState(null, "", `?${params}`); }
}
async function allowLocalNetwork() {
  try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch { /* fine */ }
}
$("join").addEventListener("submit", async (e) => { e.preventDefault(); await allowLocalNetwork(); join($("room").value); });
if (params.get("room")) { $("room").value = params.get("room"); join(params.get("room")); }

// ---------- outgoing ----------
const route = () => (local?.phoneOnline ? "local" : peerLink.open ? "peer" : local ? "local" : null);
function sendToAstronaut(msg, label) {
  if (!route()) { log("Not connected", "alert"); return; }
  const d = delayMs();
  log(d ? `${label} (arrives in ${d / 1000} s, Mars delay)` : label, "gc");
  later(() => {
    const via = route();
    if (via === "local") local.send(msg).catch(() => log("Send failed", "alert"));
    else if (via === "peer") peerLink.send(msg);
    else log("Send failed: no link", "alert");
  });
}
$("msgForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("msg").value.trim();
  if (!text) return;
  sendToAstronaut({ type: "message", text }, `GC: ${text}`);
  $("msg").value = "";
});
document.querySelectorAll("[data-event]").forEach((b) =>
  b.addEventListener("click", () => sendToAstronaut({ type: "event", name: b.dataset.event }, `EVENT ${b.textContent}`)));
document.querySelectorAll("[data-demo]").forEach((b) =>
  b.addEventListener("click", () => sendToAstronaut({ type: "demo", name: b.dataset.demo }, `TEST ${b.textContent}`)));
const applyDelay = () => delayedView.setDelay(delayMs() / 1000);
$("delayOn").addEventListener("change", () => {
  applyDelay();
  log($("delayOn").checked ? `Mars delay ON (${$("delaySec").value} s each way). The view is delayed too.` : "Mars delay OFF", "info");
});
$("delaySec").addEventListener("change", applyDelay);

// Drive (WASD): straight to the phone, no Mars delay and no log line per key (it's a test tool)
function sendNow(msg) {
  const via = route();
  if (via === "local") local.send(msg).catch(() => {});
  else if (via === "peer") peerLink.send(msg);
}
const drive = createDrive({ send: sendNow, getSpeed: () => Number($("driveSpeed").value) || 1 });
$("driveOn").addEventListener("change", (e) => {
  drive.setOn(e.target.checked);
  if (e.target.checked) e.target.blur();          // keys go to the page, not the switch
  log(e.target.checked ? "Drive ON: W/S walk, A/D sideways, Q/E or arrows turn, Shift runs (sim mode)" : "Drive OFF", "info");
});
applyDelay();   // the browser may restore the switch on reload

// local link too, when the laptop server serves this page
startLocalLink({
  picture: mjpeg,
  onData: (msg) => onPhoneData("local", msg),
  onStatus: (text, kind) => setPill("local", text, kind),
  log,
}).then((link) => { local = link; $("local").hidden = !link; });
