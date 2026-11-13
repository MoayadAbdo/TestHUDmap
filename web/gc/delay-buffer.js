// Mars delay for the picture: keeps recent pictures, oldest first, so Ground Control can show the one from
// `delay` seconds ago. Sized for the chosen delay, never more than MAX_FRAMES (~1500 x 480 px JPEG).

export const MAX_FRAMES = 1500;

/** How many pictures to keep for a delay, at `fps` pictures a second (plus a few spare). */
export const framesFor = (delaySec, fps = 1) => Math.min(MAX_FRAMES, Math.ceil(delaySec * fps) + 5);

export function createDelayBuffer(size = MAX_FRAMES) {
  const limit = (n) => Math.max(1, Math.min(MAX_FRAMES, n));
  let frames = [], capacity = limit(size);   // frames: { time, frame }
  const trim = () => { if (frames.length > capacity) frames.splice(0, frames.length - capacity); };
  return {
    add(time, frame) { frames.push({ time, frame }); trim(); },
    /** Newest picture taken at or before `time`, or null if there is none yet. */
    frameAt(time) {
      for (let i = frames.length - 1; i >= 0; i--) if (frames[i].time <= time) return frames[i].frame;
      return null;
    },
    resize(n) { capacity = limit(n); trim(); },
    clear() { frames = []; },
    get oldestTime() { return frames[0]?.time ?? null; },
    get size() { return frames.length; },
  };
}
