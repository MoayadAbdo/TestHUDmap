// Ground Control (T1.5): watch the astronaut live, follow them on the Mars map, send messages and events.
// Listens on both links at once: the laptop's local link (when server/server.mjs serves this page) and
// PeerJS with the room code. If both bring phone data, the local link wins (link-choice.js).
import { createDelayedView } from "./delayed-view.js";
import { createDrive } from "./drive.js";
import { createLinkChoice } from "./link-choice.js";
import { addMapLayers, stopLabel } from "./map-layers.js";
import { createMap3d } from "./map3d.js";
import { startLocalLink } from "./local-link.js";
import { createPairPanel } from "./pair-panel.js";
import { createPeerLink } from "./peer-link.js";
import { createQrSvg } from "./qr-svg.js";
import { makeRoomCode } from "./room-code.js";
import { createScienceReadout } from "./science-readout.js";
import { createStatusPill } from "./status-pill.js";

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
let status = null;   // one pill for the link (made once the link choice exists)
function setPill(id, text, kind) { status?.set(id, text, kind); }

// ---------- Mars delay ----------
const delayMs = () => ($("delayOn").checked ? Number($("delaySec").value) * 1000 : 0);
const later = (fn) => { const d = delayMs(); d ? setTimeout(fn, d) : fn(); };

// ---------- map ----------
const mission = await (await fetch("../mission/mission.json")).json();
const hirise = mission.layers.find((l) => l.id === "hirise")?.tiles;
const map = L.map("map", { crs: L.CRS.EPSG4326, zoomControl: true, attributionControl: true })
  .setView(mission.anchor.mars, 16);
L.tileLayer(hirise, { maxNativeZoom: 16, maxZoom: 18, attribution: "NASA/JPL/UArizona HiRISE · Mars Trek" }).addTo(map);
// the route coloured by slope: green easy, amber careful (> 12°), red no-go (> 20°, NASA's EVA limit)
const slopeColor = (deg) => (deg > 20 ? "#ef4444" : deg > 12 ? "#f59e0b" : "#4ade80");
const pts = mission.route.map((p) => ({ at: p.mars ?? [p.lat, p.lon], slope: p.slope_deg ?? 0 }));
for (let i = 1; i < pts.length; i++) {
  L.polyline([pts[i - 1].at, pts[i].at], { color: slopeColor(pts[i - 1].slope), weight: 4, opacity: 0.95 })
    .bindTooltip(`Route slope ${Math.round(pts[i - 1].slope)}°`, { sticky: true }).addTo(map);
}
L.control.scale({ metric: true, imperial: false, maxWidth: 140, position: "bottomright" }).addTo(map);
const routeKey = L.control({ position: "bottomleft" });
routeKey.onAdd = () => {
  const el = L.DomUtil.create("div", "route-key");
  el.innerHTML = 'Route <i style="background:#4ade80"></i>&lt;12° <i style="background:#f59e0b"></i>12–20° <i style="background:#ef4444"></i>&gt;20° no-go';
  el.title = "Route slope; 20° is NASA's EVA limit";
  return el;
};
routeKey.addTo(map);
// stops: small numbered pins (B = base); the name and what the layers say there on hover; the next stop glows
const pinIcon = (s, target) => L.divIcon({ className: "", iconSize: [22, 22],
  html: `<div class="stop-pin${s.is_base ? " base" : ""}${target ? " target" : ""}">${s.is_base ? "B" : s.id}</div>` });
const stopMarkers = mission.stops.map((s) => L.marker(s.mars, { icon: pinIcon(s, false) })
  .bindTooltip(`${s.id} · ${s.name}`, { direction: "top", offset: [0, -10] }).addTo(map));
let targetStop = null;
function markTarget(id) {
  if (id === targetStop) return;
  targetStop = id;
  mission.stops.forEach((s, i) => stopMarkers[i].setIcon(pinIcon(s, !s.is_base && s.id === id)));
}
// layers: slope, minerals, heat, CTX; "Show on visor" paints the same layer on the astronaut's 3D ground
// 3D map: the same route, stops, astronaut and layer, on the real height map (built the first time it's opened)
let map3d = null, layerUrl = null, lastMars = null;
$("view3d").addEventListener("click", async () => {
  const on = $("view3d").classList.toggle("on");
  $("view3d").textContent = on ? "2D" : "3D";
  $("map").style.visibility = on ? "hidden" : "";
  $("map").parentElement.classList.toggle("is3d", on);
  if (on && !map3d) {
    map3d = await createMap3d({ container: $("map3d"), mission });
    if (layerUrl) map3d.setLayer(layerUrl);
    if (lastMars) map3d.setAstronaut(lastMars);
  }
  map3d?.show(on);
  if (!on) map.invalidateSize();
});
addMapLayers({ map, L, onLayer: (url) => { layerUrl = url; map3d?.setLayer(url); }, onShowOnVisor: (l) => sendToAstronaut({ type: "layer", id: l.id }, `LAYER ${l.name} on the visor`) })
  .then((added) => {
    mapLayers = added;
    if (added) mission.stops.forEach((s, i) => stopMarkers[i].setTooltipContent(stopLabel(s, added.layers)));
  });
let mapLayers = null;
const trail = L.polyline([], { color: "#22d3ee", weight: 2, dashArray: "4 4" }).addTo(map);
const astro = L.marker(mission.anchor.mars, { icon: L.divIcon({ className: "", html: '<div class="astro"></div>', iconSize: [18, 18] }) }).addTo(map);
let followed = false;

// ---------- incoming data ----------
const science = createScienceReadout({ value: $("science"), last: $("scienceLast"), log });
let lastPlaceInfo = 0;
function onTelemetry(t) {
  // the astronaut asked "What's here?": put the same facts in the log
  if (t.place_info && t.place_info.id !== lastPlaceInfo) {
    lastPlaceInfo = t.place_info.id;
    log(`HERE · ${t.place_info.title}: ${t.place_info.lines.join("  ")}`, "info");
  }
  const set = (id, text, cls = "") => { const el = $(id); el.textContent = text; el.className = cls; };
  const hm = (min) => (min == null ? "" : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m left`);
  set("o2", t.o2_pct != null ? `${t.o2_pct}%` : "—", t.o2_pct < 30 ? "bad" : "");
  $("o2left").textContent = hm(t.o2_minutes_left);
  set("radRate", t.rad_uSv_h != null ? `${t.rad_uSv_h} µSv/h` : "—", t.rad_uSv_h > 100 ? "bad" : "");
  $("radDose").textContent = t.rad_dose_uSv != null ? `· dose ${t.rad_dose_uSv} µSv` : "";
  set("temp", t.temp_c != null ? `${t.temp_c} °C` : "—");
  const stop = mission.stops.find((s) => s.id === t.stop && !s.is_base);
  markTarget(stop?.id ?? null);
  set("stop", stop ? stop.name : t.stop == null ? "Base" : `#${t.stop}`);
  set("dnext", t.dist_next_m != null ? `${t.dist_next_m} m` : "—");
  set("home", t.walk_home_min != null ? `${t.walk_home_min} min` : "—");
  $("dbase").textContent = t.dist_base_m != null ? `· ${t.dist_base_m} m straight` : "";
  set("eva", t.eva_min != null ? `${t.eva_min} min` : "—");
  set("heading", t.heading != null ? `${t.heading}°` : "—");
  science.update(t);
  $("viewMode").textContent = { field: "· camera", sim: "· 3D simulation" }[t.mode] ?? "";
  const alerts = t.alerts ?? [];
  const state = $("evaState");
  if (t.must_return) { state.textContent = `RETURNING TO BASE · ${t.return_reason ?? "safety limit"}`; state.className = "eva-state danger"; }
  else if (alerts.length) { state.textContent = `CAUTION · ${alerts.map((a) => a.replaceAll("_", " ").toLowerCase()).join(" · ")}`; state.className = "eva-state caution"; }
  else { state.textContent = `EVA NOMINAL · walking to ${stop ? stop.name : "base"}`; state.className = "eva-state ok"; }
  if (t.mars) {
    astro.setLatLng(t.mars);
    lastMars = t.mars;
    map3d?.setAstronaut(t.mars);
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
    if (msg.type === "hello") log(`Linked to astronaut (room ${msg.room})`, "link");
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
status = createStatusPill($("status"), { current: () => choice.current() });
setInterval(() => { showView(); status.render(); }, 1000);
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
  const room = peerLink.connect(code);   // one rule for cleaning the code, in peer-link.js
  status.setRoom(room);
  if (room) { params.set("room", room); history.replaceState(null, "", `?${params}`); }
  pairing.refresh();
}
// "Pair phone": no room yet? make one and join it (peer-link retries until the phone opens it)
const pairing = createPairPanel({
  byId: $, page: () => location.href, currentRoom: () => peerLink.room,
  newRoom: () => { $("room").value = makeRoomCode(); join($("room").value); },
  makeQr: createQrSvg(window.qrcode), copyText: (text) => navigator.clipboard.writeText(text),
});
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
// An event happens ON MARS: the suit feels it at once (no delay). What Ground Control says about it
// travels at light speed, so with "Mars delay" on it arrives minutes later — that gap is the point of the demo.
const GC_WORDS = { dust: "Dust storm on the way, stay on the route", solar: "Solar storm warning: head back to base now", o2leak: "We see an O2 leak, return to base now" };
function eventNow(msg, label) {
  const via = route();
  if (!via) { log("Not connected", "alert"); return; }
  log(label, "alert");
  if (via === "local") local.send(msg).catch(() => log("Send failed", "alert"));
  else peerLink.send(msg);
}
document.querySelectorAll("[data-event]").forEach((b) =>
  b.addEventListener("click", () => {
    eventNow({ type: "event", name: b.dataset.event }, `ON MARS: ${b.textContent} hits the astronaut`);
    const words = GC_WORDS[b.dataset.event];
    if (words) sendToAstronaut({ type: "message", text: words }, `GC: ${words}`);
  }));
document.querySelector("[data-recall]")?.addEventListener("click", () =>
  sendToAstronaut({ type: "event", name: "recall" }, "GC: RECALL to base"));
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
// Reset to default: everything back to how it starts (map, the astronaut's visor and suit, delay, drive)
$("resetAll").addEventListener("click", () => {
  mapLayers?.showPhoto();
  $("delayOn").checked = false;
  applyDelay();
  $("driveOn").checked = false;
  drive.setOn(false);
  sendNow({ type: "demo", name: "reset" });     // straight away, not through the Mars delay: it's a test tool
  log("RESET to default (map, visor, suit, Mars delay, drive)", "gc");
});

applyDelay();   // the browser may restore the switch on reload

// local link too, when the laptop server serves this page
startLocalLink({
  picture: mjpeg,
  onData: (msg) => onPhoneData("local", msg),
  onStatus: (text, kind) => setPill("local", text, kind),
  log,
}).then((link) => { local = link; });
// the alert log shows alerts, messages and events; link chatter only when asked
$("showLink").addEventListener("change", (e) => $("log").classList.toggle("show-link", e.target.checked));
