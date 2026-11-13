import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, chooseHost } from "../args.mjs";

const lanHost = () => "172.20.10.3";

test("no flags: this laptop only, port 8443", () => {
  const args = parseArgs([]);
  assert.deepEqual(args, { port: 8443, host: null, lan: false });
  assert.equal(chooseHost(args, lanHost), "127.0.0.1");
});

test("--lan asks for the Wi-Fi / hotspot address", () => {
  assert.equal(chooseHost(parseArgs(["--lan"]), lanHost), "172.20.10.3");
  assert.equal(chooseHost(parseArgs(["--lan"]), () => null), null);
});

test("--host and --port", () => {
  const args = parseArgs(["--host", "192.168.1.5", "--port", "8453"]);
  assert.deepEqual(args, { port: 8453, host: "192.168.1.5", lan: false });
  assert.equal(chooseHost(args, lanHost), "192.168.1.5");
});

test("bad input is refused", () => {
  assert.throws(() => parseArgs(["--port"]), /needs a value/);
  assert.throws(() => parseArgs(["--host", "--lan"]), /needs a value/);
  assert.throws(() => parseArgs(["--port", "99999"]), /Bad port/);
  assert.throws(() => parseArgs(["--port", "abc"]), /Bad port/);
  assert.throws(() => parseArgs(["--lan", "--host", "10.0.0.2"]), /not both/);
  assert.throws(() => parseArgs(["--verbose"]), /Unknown option/);
});

test("every-network addresses are refused", () => {
  for (const host of ["0.0.0.0", "::", "[::]"]) assert.throws(() => parseArgs(["--host", host]), /every network/);
});
