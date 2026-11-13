import assert from "node:assert/strict";
import { test } from "node:test";
import { makeRoomCode, ROOM_LENGTH, ROOM_LETTERS } from "../room-code.js";

test("same letters and length as the phone's getRoom()", () => {
  assert.equal(ROOM_LETTERS, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  assert.equal(ROOM_LENGTH, 6);
});

test("random bytes pick the letters", () => {
  const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => i * 33);   // 0, 33, 66, ...
  assert.equal(makeRoomCode(bytes), "ABCDEF");
});

test("every code is 6 letters from the list", () => {
  for (let i = 0; i < 50; i++) {
    const code = makeRoomCode((n) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256)));
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/);
  }
});
