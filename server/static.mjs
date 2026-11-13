// Static files, only from inside web/.
import fs from "node:fs";
import path from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".bin": "application/octet-stream", ".woff2": "font/woff2", ".ico": "image/x-icon" };

export function createStatic(root) {
  return function serveFile(req, res, pathname) {
    const rel = decodeURIComponent(pathname);
    if (rel === "/") { res.writeHead(302, { Location: "/hud/" }); return res.end(); }
    let file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }   // no ../ escapes
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file)
      .on("error", () => { if (!res.headersSent) res.writeHead(500); res.end(); })   // one bad read must not stop the server
      .pipe(res);
  };
}
