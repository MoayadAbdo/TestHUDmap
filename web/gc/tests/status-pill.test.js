import assert from "node:assert/strict";
import { test } from "node:test";
import { createStatusPill } from "../status-pill.js";

test("one pill: linked wins, otherwise the problem", () => {
  const el = {};
  let via = null;
  const pill = createStatusPill(el, { current: () => via });
  pill.set("link", "astronaut not online yet: retrying", "warn");
  assert.equal(el.textContent, "astronaut not online yet: retrying");
  pill.setRoom("55CAGR");
  via = "peer";
  pill.render();
  assert.equal(el.textContent, "● Linked · room 55CAGR");
  assert.equal(el.className, "pill on");
});
