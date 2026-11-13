// live.js (T1.5): live link from the astronaut's phone to Ground Control.
//
// The HUD loads this module and calls sendTelemetry() every second, sendPhoto() every 2 s (field mode)
// and onMessage() for Ground Control messages.
//
// What is sent: the HUD screen as live video. In field mode that is the real phone camera (people and
// places around you), plus position and HUD numbers.
// Two links, picked when the page loads:
// - Local link: the page is served by server/server.mjs on the Ground Control laptop (same Wi-Fi or hotspot).
//   Who can watch: devices on that network that have the team password.
// - PeerJS (fallback): WebRTC through the free PeerJS service, joined with the room code (optional TURN
//   relay, see turn.js). Who can watch: anyone who knows the room code. Backup: a small screenshot every 2 s.

import { PEER_PREFIX, ICE } from "./live-config.js";
export { PEER_PREFIX, ICE };
const SNAP_MS = 2000, VIDEO_FPS = 15, PING_MS = 2000;

const state = { peer: null, conns: new Set(), calls: new Set(), stream: null, onMessage: [], room: null, status: "starting" };

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = new URL("./vendor/peerjs.min.js", import.meta.url).href;
    s.onload = () => ok(window.Peer); s.onerror = () => fail(new Error("PeerJS failed to load"));
    document.head.appendChild(s);
  });
}

/** Room code: ?room= in the URL, else the last one used on this phone, else a new random one. */
export function getRoom() {
  if (state.room) return state.room;
  const fromUrl = new URLSearchParams(location.search).get("room");
  let room = (fromUrl || localStorage.getItem("marswalk.room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (room.length < 4) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    room = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => abc[b % abc.length]).join("");
  }
  localStorage.setItem("marswalk.room", room);
  return (state.room = room);
}
export const getStatus = () => state.status;
export const viewerCount = () => state.conns.size;

function hudStream() {
  if (state.stream) return state.stream;
  // one-eye copy made by the HUD renderer (falls back to the full screen)
  const canvas = document.getElementById("hud-stream") || document.getElementById("hud");
  if (canvas?.captureStream) state.stream = canvas.captureStream(VIDEO_FPS);
  return state.stream;
}

function send(msg) {
  for (const c of state.conns) if (c.open) { try { c.send(msg); } catch (_) { /* closed */ } }
}

function onData(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "message") state.onMessage.forEach((cb) => cb({ text: msg.text }));
  if (msg.type === "want-video") callViewer(this);
  if (msg.type === "demo") window.hud?.demo?.[msg.name]?.();
  if (msg.type === "event") {
    if (msg.name === "dust") window.hud?.sim?.event?.("dust");
    const text = { dust: "DUST STORM: visibility dropping", solar: "SOLAR STORM: return to base", o2leak: "O2 LEAK: return to base now" }[msg.name];
    if (msg.name === "o2leak") window.hud?.demo?.oxygenLow?.();
    if (text) state.onMessage.forEach((cb) => cb({ text }));
  }
}

/** Send the live video to one Ground Control viewer (again if they ask). */
function callViewer(conn) {
  const stream = hudStream();
  if (!stream || !state.peer) return;
  const call = state.peer.call(conn.peer, stream);
  state.calls.add(call);
  call.on("close", () => state.calls.delete(call));
}

function sendSnapshot() {
  if (!state.conns.size) return;
  const canvas = document.getElementById("hud-stream") || document.getElementById("hud");
  if (!canvas) return;
  const w = 480, c = document.createElement("canvas");
  c.width = w; c.height = Math.round((canvas.height / canvas.width) * w) || 270;
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  send({ type: "snap", data: c.toDataURL("image/jpeg", 0.55) });
}

// Timers and the page-close hook run once; a reconnect only replaces the peer.
let peerTimersStarted = false, retryTimer = null;
function startPeerTimers() {
  if (peerTimersStarted) return;
  peerTimersStarted = true;
  // free the room code at once when the page closes, so a reload reconnects fast
  addEventListener("pagehide", () => state.peer?.destroy());
  // heartbeat: Ground Control notices a dead link within seconds and reconnects
  setInterval(() => send({ type: "ping", t: Date.now() }), PING_MS);
  // backup picture for Ground Control if the video can't play
  setInterval(sendSnapshot, SNAP_MS);
}
function retrySoon() { clearTimeout(retryTimer); retryTimer = setTimeout(connect, 2000); }

async function connect() {
  startPeerTimers();
  const Peer = await loadPeerJs();
  state.peer?.destroy();
  const peer = new Peer(PEER_PREFIX + getRoom(), { config: ICE });
  state.peer = peer;
  const current = () => state.peer === peer;
  peer.on("open", () => { if (current()) state.status = "waiting for Ground Control"; });
  peer.on("connection", (conn) => {
    conn.on("open", () => {
      state.conns.add(conn);
      state.status = "Ground Control connected";
      callViewer(conn);
      conn.send({ type: "hello", room: getRoom() });
    });
    conn.on("data", onData.bind(conn));
    conn.on("close", () => { state.conns.delete(conn); if (!state.conns.size) state.status = "waiting for Ground Control"; });
  });
  peer.on("disconnected", () => {
    if (!current() || peer.destroyed) return;
    state.status = "reconnecting";
    setTimeout(() => { if (current() && peer.disconnected && !peer.destroyed) peer.reconnect(); }, 2000);
  });
  peer.on("error", (err) => {
    if (!current()) return;                          // an old peer: already replaced
    state.status = `link error: ${err.type}`;
    // an old tab still holds the code, or the internet dropped for a moment: start over
    if (["unavailable-id", "network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
      peer.destroy(); retrySoon();
    }
  });
}

// ---------- local link: the Ground Control laptop runs server/server.mjs and serves this page ----------
const FRAME_W = 640, FRAME_GAP_MS = 120;
async function relayAvailable() {
  try { return (await fetch("/api/ping", { cache: "no-store" })).ok; } catch { return false; }
}
function startRelay() {
  state.mode = "local";
  state.status = "local link";
  const events = new EventSource("/api/phone-events");          // reconnects by itself
  events.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }   // one bad message must not stop the link
    if (msg?.type === "ping") { state.viewers = msg.viewers; state.status = msg.viewers ? "Ground Control connected" : "waiting for Ground Control"; }
    else onData(msg);
  };
  events.onerror = () => { state.status = "reconnecting to laptop"; };
  // live view: send the next frame only when the last one arrived, so lag never builds up
  const small = document.createElement("canvas");
  (async function frames() {
    for (;;) {
      const t0 = performance.now();
      const src = document.getElementById("hud-stream") || document.getElementById("hud");
      if (src?.width && state.viewers) {
        small.width = FRAME_W; small.height = Math.round((src.height / src.width) * FRAME_W);
        small.getContext("2d").drawImage(src, 0, 0, small.width, small.height);
        const blob = await new Promise((r) => small.toBlob(r, "image/jpeg", 0.6));
        try { await fetch("/api/frame", { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg" } }); } catch { /* laptop busy: try again */ }
      }
      await new Promise((r) => setTimeout(r, Math.max(30, FRAME_GAP_MS - (performance.now() - t0)) + (state.viewers ? 0 : 900)));
    }
  })();
}
let telemetryBusy = false;
function relayTelemetry(obj) {
  if (telemetryBusy) return;
  telemetryBusy = true;
  fetch("/api/telemetry", { method: "POST", body: JSON.stringify(obj), headers: { "Content-Type": "application/json" } })
    .catch(() => {}).finally(() => { telemetryBusy = false; });
}

let started = false;
function ensureStarted() {
  if (started) return;
  started = true;
  relayAvailable().then((local) => (local ? startRelay() : connect()))
    .catch((e) => { state.status = `link error: ${e.message}`; });
}
/** Label for the HUD's COMMS panel. */
export function linkLabel() {
  return state.mode === "local" ? "Ground Control: local link" : `Ground Control code ${getRoom()}`;
}

// ---------- what the HUD calls ----------
export function sendTelemetry(obj) {
  ensureStarted();
  if (state.mode === "local") relayTelemetry(obj);
  else send({ type: "telemetry", ...obj });
}
export async function sendPhoto(blob) {
  ensureStarted();
  if (state.mode === "local" || !state.conns.size || !blob) return;   // local link already streams the view
  send({ type: "photo", data: await blob.arrayBuffer() });
}
export function onMessage(callback) {
  ensureStarted();
  state.onMessage.push(callback);
}

// connect as soon as the HUD page loads
if (document.getElementById("hud")) ensureStarted();
