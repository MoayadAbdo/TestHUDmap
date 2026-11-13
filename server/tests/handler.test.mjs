import { test } from "node:test";
import assert from "node:assert/strict";
import { createBasicAuth } from "../auth.mjs";
import { createHandler } from "../handler.mjs";

const login = `Basic ${Buffer.from("team:correct-horse").toString("base64")}`;
function setup() {
  const seen = [];
  const handler = createHandler({
    allowed: createBasicAuth("correct-horse"),
    relay: { handle: async (req, res, pathname) => { seen.push(`relay ${pathname}`); return pathname.startsWith("/api/"); } },
    serveFile: (req, res, pathname) => { seen.push(`file ${pathname}`); },
    log: { warn: () => {} },
  });
  return { handler, seen };
}
const response = () => ({ writeHead(status, headers) { this.status = status; this.headers = headers; }, end() {} });

test("every route needs the login", async () => {
  const { handler, seen } = setup();
  for (const url of ["/", "/hud/", "/gc/", "/api/ping", "/api/video.mjpg", "/api/message", "/api/events", "/api/phone-events"]) {
    const res = response();
    await handler({ url, method: "GET", headers: {} }, res);
    assert.equal(res.status, 401, url);
    assert.ok(res.headers["WWW-Authenticate"], url);
  }
  assert.deepEqual(seen, []);
});

test("with the login, requests reach the relay and the files", async () => {
  const { handler, seen } = setup();
  await handler({ url: "/api/video.mjpg", method: "GET", headers: { authorization: login } }, response());
  await handler({ url: "/gc/?x=1", method: "GET", headers: { authorization: login } }, response());
  assert.deepEqual(seen, ["relay /api/video.mjpg", "relay /gc/", "file /gc/"]);
});
