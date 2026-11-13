// Local link: this page is served by server/server.mjs on the laptop. Phone data comes over SSE
// (/api/events), the live picture as MJPEG (/api/video.mjpg); messages go out as POST /api/message.

/** Returns the link, or null when this page isn't served by the laptop server. */
export async function startLocalLink({ picture, onData, onStatus, log }) {
  try { if (!(await fetch("/api/ping", { cache: "no-store" })).ok) return null; } catch { return null; }
  const link = {
    phoneOnline: false,
    async send(msg) {
      const res = await fetch("/api/message", { method: "POST", body: JSON.stringify(msg), headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  };
  const setOnline = (online) => {
    if (online === link.phoneOnline) return;
    link.phoneOnline = online;
    log(online ? "Phone connected (local link)" : "Phone not sending (local link)", "link");
  };
  picture.src = "/api/video.mjpg";
  picture.onerror = () => setTimeout(() => { picture.src = `/api/video.mjpg?${Date.now()}`; }, 1000);
  const events = new EventSource("/api/events");   // reconnects by itself
  events.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }   // one bad message must not stop the link
    if (msg?.type !== "ping") return onData(msg);
    setOnline(Boolean(msg.phoneOnline));
    onStatus(link.phoneOnline ? "local link · phone online" : "local link: waiting for phone", link.phoneOnline ? "on" : "warn");
  };
  events.onerror = () => { setOnline(false); onStatus("local link: laptop server not reachable", "warn"); };
  onStatus("local link: waiting for phone", "warn");
  return link;
}
