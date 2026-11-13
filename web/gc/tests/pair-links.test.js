import assert from "node:assert/strict";
import { test } from "node:test";
import { gcLink, hudLink, isLoopback } from "../pair-links.js";

const PAGES = "https://moayadabdo.github.io/TestHUDmap/web/gc/?room=K7Q2XM";

test("GitHub Pages: the HUD next to Ground Control, with mode and room", () => {
  assert.equal(hudLink(PAGES, "K7Q2XM", "sim"), "https://moayadabdo.github.io/TestHUDmap/web/hud/?mode=sim&room=K7Q2XM");
  assert.equal(gcLink(PAGES, "K7Q2XM"), "https://moayadabdo.github.io/TestHUDmap/web/gc/?room=K7Q2XM");
});

test("laptop server: /gc/ becomes /hud/ on the same origin", () => {
  assert.equal(hudLink("https://192.168.1.20:8443/gc/", "AB12CD", "field"), "https://192.168.1.20:8443/hud/?mode=field&room=AB12CD");
  assert.equal(gcLink("https://192.168.1.20:8443/gc/index.html", "AB12CD"), "https://192.168.1.20:8443/gc/?room=AB12CD");
  assert.equal(hudLink("http://127.0.0.1:8771/web/gc/index.html", "AB12CD", "marswalk"), "http://127.0.0.1:8771/web/hud/?mode=marswalk&room=AB12CD");
});

test("an unknown mode falls back to sim", () => {
  assert.match(hudLink(PAGES, "K7Q2XM", "<script>"), /\?mode=sim&room=K7Q2XM$/);
});

test("nothing else from this page's URL goes in: no login, other params or hash", () => {
  const page = "https://team:secret@example.org/web/gc/?agent=agent_123&turn=turn%3Ax%7Cu%7Cp&room=OLD#agent";
  for (const link of [hudLink(page, "NEW234"), gcLink(page, "NEW234")]) {
    assert.doesNotMatch(link, /agent|secret|team|turn|OLD|#/);
  }
  assert.equal(hudLink(page, "NEW234"), "https://example.org/web/hud/?mode=sim&room=NEW234");
});

test("loopback hosts: the phone can't open them", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "gc.localhost"]) assert.equal(isLoopback(host), true, host);
  for (const host of ["moayadabdo.github.io", "192.168.1.20", "mylaptop.local"]) assert.equal(isLoopback(host), false, host);
});
