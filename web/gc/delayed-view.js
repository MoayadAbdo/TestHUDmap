// Delayed view: with Mars delay on, copy the live picture about once a second and show the one from
// `delay` seconds ago on top of the live view. Delay off = the live view, as before.
import { createDelayBuffer, framesFor } from "./delay-buffer.js";

const SAMPLE_MS = 1000, WIDTH = 480, QUALITY = 0.6;

const sizeOf = (el) => (el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight]);

/**
 * screen: gets the "delayed" class while on; output: <img> for the old picture; label: text over it;
 * live(): the element showing the live picture now (<img> or <video>), or null.
 */
export function createDelayedView({ screen, output, label, live, now = () => Date.now() }) {
  const buffer = createDelayBuffer();
  const canvas = document.createElement("canvas");
  let delaySec = 0, timer = null, shown = null, shownUrl = "", generation = 0;

  async function sample() {
    const gen = generation;
    const el = live();
    const [w, h] = el ? sizeOf(el) : [0, 0];
    if (w && h) {
      canvas.width = WIDTH; canvas.height = Math.round((h / w) * WIDTH);
      try {
        canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", QUALITY));
        if (blob && delaySec && gen === generation) buffer.add(now(), blob);
      } catch { /* picture not ready yet */ }
    }
    show();
  }

  function show() {
    if (!delaySec) return;
    const frame = buffer.frameAt(now() - delaySec * 1000);
    if (!frame) {
      const wait = buffer.oldestTime == null ? delaySec : Math.ceil((buffer.oldestTime + delaySec * 1000 - now()) / 1000);
      label.textContent = `Delayed view (Mars delay ${delaySec} s): first picture in ${Math.max(0, wait)} s`;
      return;
    }
    label.textContent = `Delayed view (Mars delay ${delaySec} s)`;
    if (frame === shown) return;
    URL.revokeObjectURL(shownUrl);
    shown = frame; shownUrl = URL.createObjectURL(frame);
    output.src = shownUrl;
  }

  function stop() {
    clearInterval(timer); timer = null; delaySec = 0;
    generation += 1;                  // pictures still being made belong to the old buffer
    buffer.clear();
    URL.revokeObjectURL(shownUrl); shown = null; shownUrl = "";
    output.removeAttribute("src");
    screen.classList.remove("delayed");
  }

  return {
    /** 0 = live view; otherwise show the picture from `seconds` ago. */
    setDelay(seconds) {
      if (!seconds) return stop();
      delaySec = seconds;
      buffer.resize(framesFor(seconds, 1000 / SAMPLE_MS));
      if (!timer) timer = setInterval(sample, SAMPLE_MS);
      screen.classList.add("delayed");
      show();
    },
  };
}
