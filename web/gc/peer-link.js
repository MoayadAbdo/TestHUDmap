// PeerJS link to the phone, joined with the room code. Retries by itself; a heartbeat watchdog spots a dead link.
import { PEER_PREFIX, ICE } from "../live/live-config.js";

const RETRY_MS = 1500, DEAD_MS = 6000, WEAK_MS = 2500, VIDEO_CHECK_MS = 4000;

/**
 * onData(msg): phone messages (heartbeats left out); onStream(stream): live video;
 * onStatus(text, kind): for the pill; hasVideo(): true once the video plays.
 */
export function createPeerLink({ onData, onStream, onStatus, hasVideo, log }) {
  let peer = null, conn = null, room = null, retryTimer = null, lastData = 0;
  const retry = () => { clearTimeout(retryTimer); retryTimer = setTimeout(() => connect(room), RETRY_MS); };

  function connect(code) {
    room = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!room) return;
    clearTimeout(retryTimer);
    const oldConn = conn, oldPeer = peer;
    conn = null; peer = null;                       // old ones' events are ignored from here on
    oldConn?.close(); oldPeer?.destroy();
    onStatus("connecting…", "warn");
    const p = (peer = new Peer({ config: ICE }));
    p.on("open", () => {
      if (peer !== p) return;
      const c = (conn = p.connect(PEER_PREFIX + room, { reliable: true }));
      c.on("open", () => {
        lastData = Date.now();
        onStatus(`connected · ${room}`, "on"); log(`Connected with room code ${room}`, "info");
        // no video after 4 s? ask the phone to send it again
        setTimeout(() => { if (!hasVideo() && conn === c && c.open) c.send({ type: "want-video" }); }, VIDEO_CHECK_MS);
      });
      c.on("data", (msg) => { if (conn !== c) return; lastData = Date.now(); if (msg?.type !== "ping") onData(msg); });
      c.on("close", () => { if (conn !== c) return; onStatus("lost: reconnecting", "warn"); retry(); });
    });
    p.on("call", (call) => { if (peer !== p) return; call.answer(); call.on("stream", onStream); });
    p.on("error", (err) => {
      if (peer !== p) return;
      onStatus(err.type === "peer-unavailable" ? "astronaut not online yet: retrying" : `error: ${err.type}`, "warn");
      retry();
    });
  }

  // watchdog: no data (not even the heartbeat) for 6 s means the link is dead: reconnect
  setInterval(() => {
    if (!conn?.open) return;
    const quiet = Date.now() - lastData;
    if (quiet > DEAD_MS) { log("Room-code link silent: reconnecting", "alert"); connect(room); }
    else if (quiet > WEAK_MS) onStatus(`weak link · ${Math.round(quiet / 1000)} s`, "warn");
    else onStatus(`connected · ${room}`, "on");
  }, 1000);

  return {
    connect,
    send(msg) { if (!conn?.open) return false; conn.send(msg); return true; },
    get open() { return Boolean(conn?.open); },
  };
}
