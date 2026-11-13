import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { certificate } from "../certificate.mjs";

function fakeMaker() {
  const calls = [];
  const make = ({ key, crt, host }) => { calls.push(host); fs.writeFileSync(key, "KEY"); fs.writeFileSync(crt, `CERT ${host}`); };
  return { make, calls };
}
const made = [];
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "hud-cert-")); made.push(d); return path.join(d, "certs"); };
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

test("makes a certificate on first run, then reuses it", () => {
  const dir = tempDir(), { make, calls } = fakeMaker();
  assert.equal(certificate(dir, "127.0.0.1", make).cert.toString(), "CERT 127.0.0.1");
  certificate(dir, "127.0.0.1", make);
  assert.deepEqual(calls, ["127.0.0.1"]);
});

test("makes a new one when the address changes", () => {
  const dir = tempDir(), { make, calls } = fakeMaker();
  certificate(dir, "127.0.0.1", make);
  certificate(dir, "172.20.10.3", make);
  assert.deepEqual(calls, ["127.0.0.1", "172.20.10.3"]);
});

test("cert.pem without host.txt: makes a new one instead of crashing", () => {
  const dir = tempDir(), { make, calls } = fakeMaker();
  certificate(dir, "127.0.0.1", make);
  fs.rmSync(path.join(dir, "host.txt"));
  assert.doesNotThrow(() => certificate(dir, "127.0.0.1", make));
  assert.equal(calls.length, 2);
});
