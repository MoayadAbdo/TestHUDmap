// Command line.
//   (no flags)      127.0.0.1: this laptop only
//   --lan           the laptop's Wi-Fi / hotspot address (see network.mjs)
//   --host <ip>     one address you pick
//   --port <n>      default 8443

const EVERY_NETWORK = new Set(["0.0.0.0", "::", "[::]"]);

export function parseArgs(argv) {
  const out = { port: 8443, host: null, lan: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--lan") { out.lan = true; continue; }
    if (flag !== "--host" && flag !== "--port") throw new Error(`Unknown option: ${flag}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    out[flag.slice(2)] = value;
  }
  const port = Number(out.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Bad port: ${out.port}`);
  if (out.lan && out.host) throw new Error("Use --lan or --host, not both");
  if (out.host !== null && EVERY_NETWORK.has(out.host)) {
    throw new Error(`--host ${out.host} opens every network; pass one address or use --lan`);
  }
  return { ...out, port };
}

/** The address to listen on. lanHost(): the Wi-Fi / hotspot address or null, only asked for with --lan. */
export function chooseHost({ host, lan }, lanHost) {
  if (host) return host;
  if (lan) return lanHost();
  return "127.0.0.1";
}
