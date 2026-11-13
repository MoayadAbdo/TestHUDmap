// Team login: standard HTTP Basic auth over the HTTPS link. The browser asks once and remembers it,
// so the HUD and Ground Control pages need no login code. Password from env HUD_PASSWORD; user name "team".
import { createHash, timingSafeEqual } from "node:crypto";

export const USER = "team";
export const MIN_PASSWORD = 8;
const REALM = "Mars Walk HUD";
const digest = (text) => createHash("sha256").update(text, "utf8").digest();

/** Returns check(req): true only for the right user name and password. */
export function createBasicAuth(password, user = USER) {
  const expected = digest(`${user}:${password}`);
  return (req) => {
    const match = /^Basic\s+(\S+)\s*$/i.exec(req.headers.authorization ?? "");
    if (!match) return false;
    return timingSafeEqual(digest(Buffer.from(match[1], "base64").toString("utf8")), expected);
  };
}

export function askForLogin(res) {
  res.writeHead(401, {
    "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end("Team password needed.\n");
}

/** Why the password can't be used, or null when it's fine. `required`: true when not on loopback. */
export function passwordProblem(password, required) {
  if (!password) {
    return required
      ? "Set HUD_PASSWORD first: anyone on this network could otherwise watch the camera and send alerts.\n" +
        "  HUD_PASSWORD='pick-a-long-one' node server/server.mjs --lan"
      : null;
  }
  if (password.length < MIN_PASSWORD) return `HUD_PASSWORD must be at least ${MIN_PASSWORD} characters.`;
  return null;
}
