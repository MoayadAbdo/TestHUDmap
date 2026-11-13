// Addresses: which one --lan picks, and who can reach the one we listen on.
import { execFileSync } from "node:child_process";

const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const NOT_WIFI = /^(utun|bridge|vmnet|docker)/;   // VPN tunnels, VM and container bridges

export const isLoopback = (host) => host === "localhost" || host === "::1" || /^127\./.test(host);

/** Private IPv4 addresses with their interface names. interfaces: os.networkInterfaces(). */
export function lanCandidates(interfaces) {
  return Object.entries(interfaces).flatMap(([name, list]) => (list ?? [])
    .filter((i) => (i.family === "IPv4" || i.family === 4) && !i.internal && PRIVATE_IPV4.test(i.address))
    .map((i) => ({ name, address: i.address, skipped: NOT_WIFI.test(name) })));
}

/** The address on the default-route interface, else the first one; never a skipped one. */
export function pickLan(candidates, defaultName) {
  const usable = candidates.filter((c) => !c.skipped);
  return (usable.find((c) => c.name === defaultName) ?? usable[0])?.address ?? null;
}

/** Name of the interface that holds the default route (macOS or Linux), or null. */
export function defaultRouteInterface(run = execFileSync) {
  const ways = [["route", ["-n", "get", "default"], /interface:\s*(\S+)/], ["ip", ["route", "show", "default"], /\bdev\s+(\S+)/]];
  for (const [cmd, args, pattern] of ways) {
    try {
      const found = pattern.exec(run(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }));
      if (found) return found[1];
    } catch { /* not on this system */ }
  }
  return null;
}

/** Lines for the start-up message: every candidate, the default route and the chosen one marked. */
export function candidateLines(candidates, defaultName, chosen) {
  if (!candidates.length) return ["  No private Wi-Fi / hotspot address found."];
  return ["  Wi-Fi / hotspot addresses:", ...candidates.map((c) => {
    const notes = [c.name === defaultName && "default route", c.skipped && "skipped: VPN / VM", c.address === chosen && "using this"].filter(Boolean);
    return `    ${c.name.padEnd(10)} ${c.address.padEnd(15)} ${notes.length ? `(${notes.join(", ")})` : ""}`.trimEnd();
  })];
}

/** One plain sentence for the start-up message. */
export function whoCanReach(host) {
  if (isLoopback(host)) return "Who can reach it: only this laptop.";
  if (PRIVATE_IPV4.test(host)) return "Who can reach it: anyone on this Wi-Fi network who has the team password.";
  return `Who can reach it: anyone who can reach ${host} (maybe the internet) who has the team password.`;
}
