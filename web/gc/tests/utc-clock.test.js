import assert from "node:assert/strict";
import { test } from "node:test";
import { utcText } from "../utc-clock.js";

test("the header clock shows UTC hours, minutes and seconds", () => {
  assert.equal(utcText(new Date("2026-11-14T09:05:07.900Z")), "09:05:07");
});
