import { test } from "node:test";
import assert from "node:assert/strict";
import { lanCandidates, pickLan, defaultRouteInterface, candidateLines, isLoopback, whoCanReach } from "../network.mjs";

const interfaces = {
  lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  en5: [{ address: "192.168.2.7", family: "IPv4", internal: false }],
  en0: [{ address: "fe80::1", family: "IPv6", internal: false }, { address: "10.10.20.58", family: "IPv4", internal: false }],
  utun1000: [{ address: "10.8.0.2", family: "IPv4", internal: false }],
  bridge100: [{ address: "192.168.64.1", family: "IPv4", internal: false }],
  utun4: [{ address: "11.0.0.5", family: "IPv4", internal: false }],
};

test("candidates: private IPv4 with names; VPN and VM bridges marked skipped", () => {
  assert.deepEqual(lanCandidates(interfaces), [
    { name: "en5", address: "192.168.2.7", skipped: false },
    { name: "en0", address: "10.10.20.58", skipped: false },
    { name: "utun1000", address: "10.8.0.2", skipped: true },
    { name: "bridge100", address: "192.168.64.1", skipped: true },
  ]);
});

test("picks the default-route interface over the first match", () => {
  const all = lanCandidates(interfaces);
  assert.equal(pickLan(all, "en0"), "10.10.20.58");
  assert.equal(pickLan(all, "utun1000"), "192.168.2.7");   // default route on the VPN: first usable one
  assert.equal(pickLan(all, null), "192.168.2.7");
  assert.equal(pickLan(all.filter((c) => c.skipped), "utun1000"), null);
});

test("default route from macOS `route` or Linux `ip`", () => {
  const mac = (cmd) => { if (cmd === "route") return "   route to: default\n  interface: en0\n"; throw new Error("no"); };
  const linux = (cmd) => { if (cmd === "ip") return "default via 192.168.1.1 dev wlan0 proto dhcp\n"; throw new Error("no"); };
  assert.equal(defaultRouteInterface(mac), "en0");
  assert.equal(defaultRouteInterface(linux), "wlan0");
  assert.equal(defaultRouteInterface(() => { throw new Error("no"); }), null);
});

test("start-up lines mark default route, skipped and chosen", () => {
  const lines = candidateLines(lanCandidates(interfaces), "en0", "10.10.20.58").join("\n");
  assert.match(lines, /en0 +10\.10\.20\.58 +\(default route, using this\)/);
  assert.match(lines, /utun1000 +10\.8\.0\.2 +\(skipped: VPN \/ VM\)/);
  assert.match(candidateLines([], null, null)[0], /No private/);
});

test("loopback and who can reach it", () => {
  assert.ok(isLoopback("127.0.0.1") && isLoopback("::1") && isLoopback("localhost"));
  assert.ok(!isLoopback("172.20.10.3"));
  assert.match(whoCanReach("127.0.0.1"), /only this laptop/);
  assert.match(whoCanReach("172.20.10.3"), /anyone on this Wi-Fi network/);
  assert.match(whoCanReach("203.0.113.9"), /maybe the internet/);
});
