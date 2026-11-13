// Live view as MJPEG: each Ground Control viewer gets the phone's pictures as one long response.
// A viewer that stops reading (e.g. a background tab) skips pictures instead of piling them up in memory.

export const MAX_BUFFERED = 1_000_000;

const part = (jpeg) => Buffer.concat([
  Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`),
  jpeg,
  Buffer.from("\r\n"),
]);

export function createVideoFanout({ maxBuffered = MAX_BUFFERED } = {}) {
  const viewers = new Set();
  let last = null;
  return {
    add(res) {
      res.writeHead(200, { "Content-Type": "multipart/x-mixed-replace; boundary=frame", "Cache-Control": "no-store", Connection: "keep-alive" });
      viewers.add(res);
      res.on("close", () => viewers.delete(res));
      if (last) res.write(last);
    },
    /** Sends one JPEG to every viewer that keeps up; returns how many were skipped. */
    send(jpeg) {
      last = part(jpeg);
      let skipped = 0;
      for (const v of viewers) {
        if (v.writableLength > maxBuffered) skipped++;
        else v.write(last);
      }
      return skipped;
    },
    get size() { return viewers.size; },
  };
}
