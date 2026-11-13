import { test } from "node:test";
import assert from "node:assert/strict";
import { createVideoFanout } from "../video.mjs";

function viewer(writableLength = 0) {
  const handlers = {};
  return {
    writableLength, writes: [],
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(chunk) { this.writes.push(chunk); },
    on(name, fn) { handlers[name] = fn; },
    close() { handlers.close?.(); },
  };
}

test("each picture goes out as one MJPEG part", () => {
  const video = createVideoFanout();
  const v = viewer();
  video.add(v);
  assert.match(v.headers["Content-Type"], /multipart\/x-mixed-replace; boundary=frame/);
  video.send(Buffer.from("JPEG"));
  assert.equal(v.writes.length, 1);
  assert.equal(v.writes[0].toString(), "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 4\r\n\r\nJPEG\r\n");
});

test("a new viewer gets the last picture at once", () => {
  const video = createVideoFanout();
  video.send(Buffer.from("ONE"));
  const v = viewer();
  video.add(v);
  assert.match(v.writes[0].toString(), /ONE/);
});

test("a stalled viewer skips pictures, the others still get them", () => {
  const video = createVideoFanout({ maxBuffered: 1000 });
  const fast = viewer(0), stalled = viewer(5000);
  video.add(fast); video.add(stalled);
  assert.equal(video.send(Buffer.from("A")), 1);
  assert.equal(fast.writes.length, 1);
  assert.equal(stalled.writes.length, 0);
  stalled.writableLength = 0;              // caught up
  video.send(Buffer.from("B"));
  assert.equal(stalled.writes.length, 1);
});

test("closed viewers are dropped", () => {
  const video = createVideoFanout();
  const v = viewer();
  video.add(v);
  v.close();
  assert.equal(video.size, 0);
});
