# server/: local link (runs on the Ground Control laptop)

Phone and laptop on **one network** (the phone's hotspot, or the same Wi-Fi). The laptop serves the pages and relays the live view, data and messages. The link itself needs no internet. The voice agent and the Ground Control **map** do: the map pictures (HiRISE tiles) come from `trek.nasa.gov`.

```bash
node server/server.mjs                                                   # this laptop only (127.0.0.1), for testing
HUD_PASSWORD='long-team-password' node server/server.mjs --lan          # phone + laptop on the hotspot / Wi-Fi
HUD_PASSWORD='long-team-password' node server/server.mjs --host 172.20.10.3 --port 8443
```

- **Who can reach it:** with no flags, only this laptop. With `--lan` or `--host`, **anyone on this Wi-Fi network who has the team password**. It listens on one address, never on all of them (`0.0.0.0` is refused).
- **Login:** with `--lan` / `--host` it won't start without `HUD_PASSWORD` (8 characters or more). Every page and every `/api/` call needs it. The browser asks once (user **`team`**, password = `HUD_PASSWORD`) and remembers it until the browser closes. On loopback the login is on too when `HUD_PASSWORD` is set.
- Share the password with the team in person. Never put it in the repo.
- `--lan` picks the address on the default-route interface and skips VPN / VM ones (`utun*`, `bridge*`, `vmnet*`, `docker*`). It prints every address it found; pick another with `--host <ip>`.

It prints the links:
- **Phone:** `https://<laptop-ip>:8443/hud/`
- **Ground Control:** `https://<laptop-ip>:8443/gc/`

First time on each device the browser says **"Your connection is not private"** → **Advanced** → **Proceed**. (It's the laptop's own certificate, made on first run in `server/certs/`, not committed.) On a Mac, click **Allow** if it asks about incoming connections for `node`.

## Phone can't connect?
1. Phone and laptop on the **same network**.
2. On the phone, open the `/api/ping` link first (the server prints it). The login prompt, then `{"ok":true}`, means the phone reaches the laptop.
3. Accept the certificate warning (iPhone: **Show Details** → **visit this website**; Android: **Advanced** → **Proceed**).
4. Laptop firewall asks about incoming connections → **Allow**.
5. Corporate laptops with VPN or security software often block incoming connections: use a personal laptop.
6. Some venue / office Wi-Fi keeps devices apart: use the **phone's hotspot**.

Still stuck: use the room-code link (PeerJS, optional TURN relay), see `web/live/README.md`. Ground Control listens on both links at once.

## How it works
- Live view: MJPEG. The phone sends the next picture only when the last one arrived, so lag never builds up. A viewer that stops reading (e.g. a background tab) skips pictures, so memory stays small.
- Data and messages: server-sent events, which reconnect by themselves.
- Files: `server.mjs` (start-up), `args.mjs` (flags), `network.mjs` (addresses), `auth.mjs` (login), `handler.mjs` (login check, then routes), `relay.mjs` (`/api/`), `video.mjs` (MJPEG), `static.mjs` (files in `web/`), `certificate.mjs`.
- Tests: `node --test server/tests/*.test.mjs`
