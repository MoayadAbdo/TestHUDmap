// Optional TURN relay for the PeerJS link. Phone and laptop both connect out to it, so it still works
// behind VPNs, firewalls and Wi-Fi that keeps devices apart.
// Give it once in the URL:  ?turn=turns:HOST:443?transport=tcp|USER|PASSWORD   (repeat ?turn= for more)
// It is kept in this browser (localStorage) and taken out of the address bar. ?turn=off forgets it.
// Never commit TURN user names or passwords.

const KEY = "marswalk.turn";

/** "url|user|password" -> RTCIceServer, or null if it isn't a TURN server with a login. */
export function parseTurn(text) {
  const [urls, username, ...rest] = String(text).split("|");
  const credential = rest.join("|");
  return /^turns?:/.test(urls) && username && credential ? { urls, username, credential } : null;
}

const valid = (s) => s && parseTurn(`${s.urls}|${s.username}|${s.credential}`);

/** TURN servers from ?turn= (saved for next time) or from the saved list. */
export function turnServers({ location, history, storage }) {
  const params = new URLSearchParams(location.search);
  const given = params.getAll("turn");
  if (given.length) {
    const servers = given.includes("off") ? [] : given.map(parseTurn).filter(Boolean);
    storage.setItem(KEY, JSON.stringify(servers));
    params.delete("turn");
    const rest = params.toString();
    history.replaceState(history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    return servers;
  }
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter(valid) : [];
  } catch {
    return [];
  }
}
