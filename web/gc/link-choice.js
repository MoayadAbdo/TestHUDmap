// Ground Control listens on both links. If both bring phone data, use the local link and ignore PeerJS,
// so nothing is counted twice; PeerJS data is used when the local link has been quiet for a moment.

export const QUIET_MS = 3000;

export function createLinkChoice({ now = () => Date.now(), quietMs = QUIET_MS } = {}) {
  let lastLocal = -Infinity, lastPeer = -Infinity;
  return {
    /** Call for each phone message; true when this one should be used. source: "local" or "peer". */
    accept(source) {
      const t = now();
      if (source === "local") { lastLocal = t; return true; }
      lastPeer = t;
      return t - lastLocal > quietMs;
    },
    /** Which link the phone data comes from now: "local", "peer" or null. */
    current() {
      const t = now();
      if (t - lastLocal <= quietMs) return "local";
      if (t - lastPeer <= quietMs) return "peer";
      return null;
    },
  };
}
