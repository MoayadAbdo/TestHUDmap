# web/gc/ (T1.5): Ground Control

Open `/gc/` on the laptop. Served by `server/server.mjs`, it uses the **local link** at once. It also keeps the **room code** form: type the code shown on the astronaut's HUD (under COMMS) and press **Connect** to join over PeerJS too. Both links listen at the same time; if both bring data, the local link wins. The pills show each link and where the data comes from.

- **Astronaut view:** live video of exactly what the astronaut sees (camera or 3D Mars, with the HUD).
- **Mars map:** HiRISE (Mars Trek, needs internet) with Curiosity's route, the stops, and the astronaut's live position and trail.
- **Readouts:** oxygen, radiation dose, next stop, distances, heading, science (samples done / total, the last one). **Alert log** (one green line per new sample).
- **Pair phone** (header): a QR of the phone HUD link for this room (`../hud/?mode=sim|marswalk|field&room=CODE`), the code in big letters, and a Ground Control link to copy for more laptops. No room yet? It makes one. Only the page address, the mode and the room code go in the QR. Esc or Close shuts it.
- **Message to astronaut**, **events:** dust storm, solar storm, O₂ leak, steep ground.
- **Mars delay** switch (20 s demo up to 22 min): messages, data **and the view** are delayed. The view shows a picture from that many seconds ago ("Delayed view (Mars delay 20 s)"), about one a second, kept in memory (at most 1500 small pictures). Off = live view.
- Files: `gc.js` (page), `local-link.js`, `peer-link.js`, `link-choice.js` (which link wins), `delayed-view.js` + `delay-buffer.js` (Mars delay view), `pair-panel.js` + `pair-links.js` + `room-code.js` + `qr-svg.js` (Pair phone), `science-readout.js`.
- Libraries: `vendor/leaflet.*` (Leaflet 1.9.4, BSD-2), `vendor/qrcode.js` (qrcode-generator 2.0.4 by Kazuhiko Arase, MIT, `vendor/LICENSE-qrcode-generator`).
- Tests: `cd web/gc && npm test` (or `node --test web/gc/tests/*.test.js`).
