// "Pair phone" panel: a QR of the HUD link for this room, the room code in big letters, and a
// Ground Control link to copy for more laptops. Opens from the header; Esc or Close shuts it.
import { gcLink, hudLink, isLoopback } from "./pair-links.js";

const IDS = { open: "pairOpen", panel: "pair", close: "pairClose", qr: "pairQr", code: "pairCode",
  mode: "pairMode", copy: "pairCopy", link: "pairGcLink", note: "pairNote" };
const COPY_LABEL = "Copy Ground Control link", FLASH_MS = 2000;

/**
 * byId(id): the page's elements; page(): this page's URL; currentRoom(): the joined room ('' if none);
 * newRoom(): makes a room and joins it; makeQr(text): SVG text; copyText(text): may return a promise.
 */
export function createPairPanel({ byId, page, currentRoom, newRoom, makeQr, copyText, keys = document, timers = globalThis }) {
  const el = Object.fromEntries(Object.entries(IDS).map(([key, id]) => [key, byId(id)]));
  const isOpen = () => !el.panel.hidden;
  let flashTimer = null;

  function render() {
    const room = currentRoom();
    if (!room) return;
    const hud = hudLink(page(), room, el.mode.value);
    el.qr.innerHTML = makeQr(hud);      // SVG made from the link only
    el.qr.dataset.text = hud;           // what the QR says, for checks
    el.qr.setAttribute("aria-label", `QR code: the phone HUD for room ${room}`);
    el.code.textContent = room;
    el.link.value = gcLink(page(), room);
    el.note.hidden = !isLoopback(new URL(page()).hostname);
  }
  function show() {
    if (!currentRoom()) newRoom();
    render();
    el.panel.hidden = false;
    el.open.setAttribute("aria-expanded", "true");
    el.close.focus();
  }
  function hide() {
    el.panel.hidden = true;
    el.open.setAttribute("aria-expanded", "false");
    el.open.focus();
  }
  function flash(text) {
    el.copy.textContent = text;
    timers.clearTimeout(flashTimer);
    flashTimer = timers.setTimeout(() => { el.copy.textContent = COPY_LABEL; }, FLASH_MS);
  }
  function copy() {
    return Promise.resolve().then(() => copyText(el.link.value)).then(
      () => flash("Copied"),
      () => { el.link.select(); flash("Copy failed: link selected"); });
  }

  el.open.addEventListener("click", () => (isOpen() ? hide() : show()));
  el.close.addEventListener("click", hide);
  el.mode.addEventListener("change", render);
  el.copy.addEventListener("click", copy);
  keys.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) hide(); });
  return { refresh: () => { if (isOpen()) render(); }, isOpen };
}
