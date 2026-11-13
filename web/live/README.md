# web/live/ (T1.5): live link phone ↔ Ground Control

`live.js` is loaded by the HUD. It streams the HUD screen as **live video** to Ground Control, sends the telemetry every second, and receives messages and events.

- **What is sent:** the HUD screen. In **field mode that is the real phone camera** (people and places around you), plus position and HUD numbers. In sim mode it is the 3D Mars + HUD.
- **Two links**, picked when the page loads:
  - **Local link:** the page is served by `server/server.mjs` on the Ground Control laptop. Who can watch: devices on that network that have the team password (see `server/README.md`).
  - **PeerJS (fallback):** WebRTC through the free PeerJS service (no account). `vendor/peerjs.min.js` (MIT). **Who can watch: anyone who knows the room code.**
- **Room code:** shown on the HUD under COMMS ("Ground Control code K7Q2XM"). Fix one with `/hud/?room=MYCODE`.
- Backup: a small screenshot every 2 s if the video can't play.
- Tip: if it won't connect on mobile data, connect the Ground Control laptop to the **phone's hotspot**.

## Optional TURN relay (PeerJS link)
Phone and laptop both connect **out** to a TURN server, so the link still works behind VPNs, firewalls and Wi-Fi that keeps devices apart.

1. **Manual step, someone on the team must do it:** create a free TURN account (for example the free plan at metered.ca, or Cloudflare's TURN service). Copy a TURN address, user name and password from its dashboard.
2. Open the HUD and Ground Control once with `?turn=turns:HOST:443?transport=tcp|USER|PASSWORD`
   (add `&turn=…` for more servers; URL-encode `&`, `+`, `#` in the password).
3. Each browser keeps it (localStorage) and takes it out of the address bar. `?turn=off` forgets it.

**Never commit TURN user names or passwords**, and don't post the `?turn=` link in public chats.

Tests: `cd web/live && npm test` (or `node --test web/live/tests/*.test.js`).
