import assert from "node:assert/strict";
import { test } from "node:test";
import { createDrive } from "../drive.js";

function setup() {
  const handlers = {};
  const win = { addEventListener: (t, fn) => { handlers[t] = fn; } };
  let tick = null;
  const timers = { setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = null; } };
  const sent = [];
  const drive = createDrive({ win, send: (m) => sent.push(m), timers, getSpeed: () => 3 });
  const key = (type, code, target = { tagName: "BODY" }) => handlers[type]({ code, target, preventDefault() {} });
  return { drive, sent, key, tick: () => tick?.() };
}

test("sends moves while a key is held, then one stop", () => {
  const { drive, sent, key, tick } = setup();
  drive.setOn(true);
  key("keydown", "KeyW");
  tick(); tick();
  key("keyup", "KeyW");
  tick(); tick();
  assert.deepEqual(sent.map((m) => m.forward), [1, 1, 0]);
  assert.ok(sent.every((m) => m.type === "move" && m.boost === 3));
});

test("ignores keys while off or while typing a message", () => {
  const { drive, sent, key, tick } = setup();
  key("keydown", "KeyW");
  drive.setOn(true);
  key("keydown", "KeyD", { tagName: "INPUT" });
  tick();
  assert.equal(sent.length, 0);
});
