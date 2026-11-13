// The two links in "Pair phone": the phone HUD for this room (the QR) and this page for more laptops.
// Built from the page address, the mode and the room code only: nothing else from this URL goes in.

export const HUD_MODES = ["sim", "marswalk", "field"];

/** The page's folder ("./") or the HUD folder next to it ("../hud/"), without login, query or hash. */
const folder = (pageUrl, path) => {
  const url = new URL(pageUrl);
  return new URL(new URL(path, url).pathname, url.origin);
};

/** .../web/gc/ -> .../web/hud/?mode=sim&room=CODE (laptop server: /gc/ -> /hud/). */
export function hudLink(pageUrl, room, mode = "sim") {
  const link = folder(pageUrl, "../hud/");
  link.searchParams.set("mode", HUD_MODES.includes(mode) ? mode : "sim");
  link.searchParams.set("room", room);
  return link.href;
}

/** .../web/gc/?room=CODE */
export function gcLink(pageUrl, room) {
  const link = folder(pageUrl, "./");
  link.searchParams.set("room", room);
  return link.href;
}

/** True when the phone can't open this host (it is the laptop itself). */
export const isLoopback = (hostname) =>
  hostname === "localhost" || hostname.endsWith(".localhost") || /^127\./.test(hostname) || hostname === "[::1]";
