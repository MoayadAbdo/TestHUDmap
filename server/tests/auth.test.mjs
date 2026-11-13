import { test } from "node:test";
import assert from "node:assert/strict";
import { createBasicAuth, askForLogin, passwordProblem } from "../auth.mjs";

const basic = (text) => ({ headers: { authorization: `Basic ${Buffer.from(text).toString("base64")}` } });
const check = createBasicAuth("correct-horse");

test("right user and password pass", () => {
  assert.equal(check(basic("team:correct-horse")), true);
  assert.equal(check({ headers: { authorization: `basic  ${Buffer.from("team:correct-horse").toString("base64")}` } }), true);
});

test("anything else fails", () => {
  assert.equal(check({ headers: {} }), false);
  assert.equal(check(basic("team:wrong")), false);
  assert.equal(check(basic("team:correct-horsE")), false);
  assert.equal(check(basic("other:correct-horse")), false);
  assert.equal(check(basic("team:")), false);
  assert.equal(check(basic("team")), false);
  assert.equal(check({ headers: { authorization: "Bearer correct-horse" } }), false);
  assert.equal(check({ headers: { authorization: "Basic" } }), false);
});

test("password may contain a colon", () => {
  assert.equal(createBasicAuth("a:b:c:d:e")(basic("team:a:b:c:d:e")), true);
});

test("401 asks the browser for a login", () => {
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  askForLogin(res);
  assert.equal(res.status, 401);
  assert.match(res.headers["WWW-Authenticate"], /^Basic realm="Mars Walk HUD"/);
});

test("password rules", () => {
  assert.match(passwordProblem("", true), /Set HUD_PASSWORD/);
  assert.equal(passwordProblem("", false), null);
  assert.match(passwordProblem("short", false), /at least 8/);
  assert.equal(passwordProblem("long-enough", true), null);
});
