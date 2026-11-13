// Self-signed certificate (phones need HTTPS for camera, GPS and motion). Made on first run, and again
// when the address changes or a file is missing.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";

function openssl({ key, crt, host }) {
  const names = [...new Set([host, "127.0.0.1"])].map((h) => (net.isIP(h) ? `IP:${h}` : `DNS:${h}`));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "365",
    "-subj", "/CN=Mars Walk HUD", "-addext", `subjectAltName=${[...names, "DNS:localhost"].join(",")}`], { stdio: "ignore" });
}

export function certificate(dir, host, make = openssl) {
  const key = path.join(dir, "key.pem"), crt = path.join(dir, "cert.pem"), forHost = path.join(dir, "host.txt");
  const madeFor = fs.existsSync(forHost) ? fs.readFileSync(forHost, "utf8").trim() : null;
  if (!fs.existsSync(key) || !fs.existsSync(crt) || madeFor !== host) {
    fs.mkdirSync(dir, { recursive: true });
    make({ key, crt, host });
    fs.writeFileSync(forHost, host);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}
