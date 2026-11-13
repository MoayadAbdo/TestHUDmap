# web/gc/ (T1.5): Ground Control

Open `/gc/` on the laptop. Served by `server/server.mjs`, it uses the **local link** at once. It also keeps the **room code** form: type the code shown on the astronaut's HUD (under COMMS) and press **Connect** to join over PeerJS too. Both links listen at the same time; if both bring data, the local link wins. The pills show each link and where the data comes from.

- **Astronaut view:** live video of exactly what the astronaut sees (camera or 3D Mars, with the HUD).
- **Mars map:** HiRISE (Mars Trek, needs internet) with Curiosity's route, the stops, and the astronaut's live position and trail.
- **Readouts:** oxygen, radiation dose, next stop, distances, heading. **Alert log.**
- **Message to astronaut**, **events:** dust storm, solar storm, O₂ leak, steep ground.
- **Mars delay** switch (20 s demo up to 22 min): messages, data **and the view** are delayed. The view shows a picture from that many seconds ago ("Delayed view (Mars delay 20 s)"), about one a second, kept in memory (at most 1500 small pictures). Off = live view.
- Files: `gc.js` (page), `local-link.js`, `peer-link.js`, `link-choice.js` (which link wins), `delayed-view.js` + `delay-buffer.js` (Mars delay view).
- Libraries: `vendor/leaflet.*` (Leaflet 1.9.4, BSD-2).
- Tests: `cd web/gc && npm test` (or `node --test web/gc/tests/*.test.js`).
