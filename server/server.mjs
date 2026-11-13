// Mars Walk HUD: local link server (runs on the Ground Control laptop).
//
//   node server/server.mjs                                 # this laptop only (127.0.0.1)
//   HUD_PASSWORD='long-team-password' node server/server.mjs --lan          # phone on the same Wi-Fi / hotspot
//   HUD_PASSWORD='long-team-password' node server/server.mjs --host 172.20.10.3 --port 8443
//
// Serves web/ over HTTPS (self-signed certificate, made on first run) and relays the live view, data and
// messages between the phone and Ground Control (see relay.mjs). No internet needed for the link.
// Off loopback it needs HUD_PASSWORD: the browser asks once for user "team" + that password (auth.mjs).
// It binds one address, never every interface. Stop it with Ctrl+C.
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, chooseHost } from "./args.mjs";
import { createBasicAuth, passwordProblem, USER } from "./auth.mjs";
import { certificate } from "./certificate.mjs";
import { createHandler } from "./handler.mjs";
import { lanCandidates, pickLan, defaultRouteInterface, candidateLines, isLoopback, whoCanReach } from "./network.mjs";
import { createRelay } from "./relay.mjs";
import { createStatic } from "./static.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..", "web");
const CERTS = path.join(HERE, "certs");

function fail(text) { console.error(text); process.exit(1); }

let args;
try { args = parseArgs(process.argv.slice(2)); } catch (e) { fail(`${e.message}\nUsage: node server/server.mjs [--lan | --host <ip>] [--port <n>]`); }
const candidates = args.lan ? lanCandidates(os.networkInterfaces()) : [];
const defaultName = args.lan ? defaultRouteInterface() : null;
const host = chooseHost(args, () => pickLan(candidates, defaultName));
if (args.lan) console.log(candidateLines(candidates, defaultName, host).join("\n"));
if (!host) fail("No Wi-Fi / hotspot address found. Connect the laptop to the phone's hotspot, or pass --host <ip>.");

const password = process.env.HUD_PASSWORD ?? "";
const problem = passwordProblem(password, !isLoopback(host));
if (problem) fail(problem);

const relay = createRelay();
setInterval(relay.heartbeat, 2000);
const handler = createHandler({
  allowed: password ? createBasicAuth(password) : () => true,
  relay,
  serveFile: createStatic(WEB),
});

const server = https.createServer(certificate(CERTS, host), handler);
server.keepAliveTimeout = 65_000;
server.listen(args.port, host, () => {
  const base = `https://${host.includes(":") ? `[${host}]` : host}:${args.port}`;
  console.log(`\nMars Walk HUD link server on ${base}`);
  console.log(`  ${whoCanReach(host)}`);
  console.log(password ? `  Login: user "${USER}" + HUD_PASSWORD` : "  No login (HUD_PASSWORD not set).");
  console.log(`  Phone:          ${base}/hud/${isLoopback(host) ? "  (the phone can't reach this; use --lan)" : ""}`);
  console.log(`  Ground Control: ${base}/gc/`);
  if (!isLoopback(host)) {
    console.log(`  Phone check: on the phone, open ${base}/api/ping first. If it never loads, this laptop blocks incoming`);
    console.log("  connections (VPN, firewall or Wi-Fi isolation): use another laptop or the phone hotspot.");
  }
  console.log("  First time: the browser warns 'not private' -> Advanced -> Proceed.  Ctrl+C to stop.\n");
});
