// One request: login check first (every route), then the relay, then static files.
import { askForLogin } from "./auth.mjs";

/** allowed(req): the login check, or () => true when no password is set (loopback only). */
export function createHandler({ allowed, relay, serveFile, log = console }) {
  return async (req, res) => {
    try {
      if (!allowed(req)) {
        if (req.headers.authorization) log.warn(`Wrong password from ${req.socket?.remoteAddress}`);
        return askForLogin(res);
      }
      const { pathname } = new URL(req.url, "https://x");
      if (await relay.handle(req, res, pathname)) return;
      serveFile(req, res, pathname);
    } catch (e) {
      if (!res.headersSent) res.writeHead(400);
      res.end(String(e.message ?? e));
    }
  };
}
