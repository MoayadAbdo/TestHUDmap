// Relay between the phone and Ground Control (routes under /api/).
//   phone  -> POST /api/frame (JPEG)     -> GET /api/video.mjpg        (Ground Control live view)
//   phone  -> POST /api/telemetry        -> GET /api/events (SSE)      (Ground Control data)
//   Ground Control -> POST /api/message  -> GET /api/phone-events (SSE) (to the phone)
import { createVideoFanout } from "./video.mjs";

const PHONE_ONLINE_MS = 7000;

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > limit) { req.destroy(); fail(new Error("too big")); } else chunks.push(c); });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}
const readJson = async (req) => JSON.parse((await readBody(req, 100_000)).toString());

function openStream(res, clients) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  res.write("retry: 1000\n\n");
  clients.add(res);
  res.on("close", () => clients.delete(res));
}
function push(clients, obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const c of clients) c.write(line);
}

export function createRelay({ video = createVideoFanout(), now = Date.now } = {}) {
  const gcClients = new Set(), phoneClients = new Set();
  let lastTelemetry = null, lastPhoneSeen = 0;
  const done = (res, status = 204) => { res.writeHead(status); res.end(); return true; };

  /** Heartbeat both ways, plus phone link status for Ground Control. Call every 2 s. */
  function heartbeat() {
    push(gcClients, { type: "ping", phoneOnline: now() - lastPhoneSeen < PHONE_ONLINE_MS });
    push(phoneClients, { type: "ping", viewers: gcClients.size });
  }

  /** Handles /api/* routes; returns false for anything else. */
  async function handle(req, res, pathname) {
    const post = req.method === "POST";
    if (pathname === "/api/ping") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); return true; }
    if (pathname === "/api/frame" && post) {
      video.send(await readBody(req, 2_000_000)); lastPhoneSeen = now();
      return done(res);
    }
    if (pathname === "/api/video.mjpg") { video.add(res); return true; }
    if (pathname === "/api/telemetry" && post) {
      lastTelemetry = await readJson(req); lastPhoneSeen = now();
      push(gcClients, { ...lastTelemetry, type: "telemetry" });
      return done(res);
    }
    if (pathname === "/api/events") {
      openStream(res, gcClients);
      if (lastTelemetry) push(new Set([res]), { ...lastTelemetry, type: "telemetry" });
      return true;
    }
    if (pathname === "/api/phone-events") { openStream(res, phoneClients); lastPhoneSeen = now(); return true; }
    if (pathname === "/api/message" && post) { push(phoneClients, await readJson(req)); return done(res); }
    return false;
  }

  return { handle, heartbeat };
}
