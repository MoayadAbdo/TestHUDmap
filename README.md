# Mars Walk HUD

A cheap helmet display for astronauts on a Marswalk: an Android phone in a VR box shows a HUD over the real camera (desert) or a Mars panorama (VR simulation), with a voice assistant and a live Ground Control screen. Built for NASA Space Apps 2026.

- System design: [docs/system-design.md](docs/system-design.md)

## Folders and owners

| Folder | What | Owner |
|---|---|---|
| `builder/` | Python scripts that build `mission.json` from NASA data (+ panorama stitching) | AI1 (+ AI3) |
| `ai/` | Voice agent setup: prompt, knowledge files, tests | AI2 |
| `web/hud/` | Phone HUD | FS1 |
| `web/sim/` | VR simulation (`sim.js`) | AI3 |
| `web/ai/` | Voice code used by the HUD (`voice.js`) | AI2 |
| `web/live/` | Live link (`live.js`): laptop server, PeerJS fallback | FS2 |
| `web/gc/` | Ground Control | FS2 |
| `web/mission/` | `mission.json` + `assets/` (output of `builder/`) | AI1 |
| `server/` | Laptop link server (`server.mjs`): serves `web/` + relays phone ↔ Ground Control | FS2 |

## Rules
1. **Only edit your own folder.** Need a change in someone else's? Ask them.
2. Work on your own branch (`ai1-mission`, `fs1-hud`, …), then open a Pull Request to `main`.
3. **Never commit API keys or passwords.** This repo is public.
4. `mission.json` format changes → tell everyone first.

## Live URLs (laptop server, see [server/README.md](server/README.md))
Start on the Ground Control laptop: `HUD_PASSWORD='long-team-password' node server/server.mjs --lan` (login: user `team` + that password).
- HUD (phone): `https://<laptop-ip>:8443/hud/`
- Ground Control (laptop): `https://<laptop-ip>:8443/gc/`
- Fallback: served from anywhere else, the link goes through PeerJS with the room code shown on the HUD (see [web/live/README.md](web/live/README.md)).
