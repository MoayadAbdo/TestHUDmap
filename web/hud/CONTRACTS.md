# What the HUD needs from the other tasks

Until a part is deployed, the HUD uses a stand-in from `/hud/dev`, so nobody is blocked.
Paths are set in `js/config.js`.

## T1.1 mission.json (served at `/mission/mission.json`)
```json
{
  "anchor": { "mars": [lat, lon], "field": [lat, lon] | null, "rotation_deg": 0, "scale": 1.0 },
  "route": [{ "mars": [lat, lon], "slope_deg": 8.6 }],
  "stops": [{ "id": 1, "name": "...", "mars": [lat, lon], "photo": "url",
              "task": "...", "hazard": "...", "science": "...",
              "conditions": { "temp_c": -48, "rad_uSv_h": 27.9 } }],
  "suit": { "o2_start_pct": 100, "o2_pct_per_min": 0.25, "walk_speed_mps": 0.8 }
}
```
- **rotation_deg**: how far Mars offsets turn **clockwise** to land in the desert. Use `js/core/twin.js` (`marsToField`) so both sides agree.
- **scale**: desert metres per Mars metre.
- **anchor.field = null**: the first good GPS fix (±20 m) becomes base; after 10 s / 25 s it accepts ±50 / ±120 m and says so. Demo panel → "Set base here" retries.
- **site**: text ("Mount Sharp boxwork, Gale Crater, Mars": the visor shows the part before the first comma) or `{ name }`.
- **stops[].sol**: the sol the weather comes from (the visor shows "Weather: sol N").
- **stops[].photo_credit** (optional): text, or an object like `{ credit, camera, sol }`, shown on the photo.
- **route[].slope_deg**: ground slope measured over at least 10 m ahead of this point (not rover tilt; that is `tilt_deg`). Needed for the steep-ground alert.
- Example built from real Curiosity data: `dev/sample-mission.json`.

## T1.2 voice (module at `/ai/voice.js`)
- `toggleVoice()`: start/stop talking (the Cardboard lever calls it).
- `convo` or `getConversation()` with `sendContextualUpdate(text)`: the HUD tells the agent about arrivals and return-to-base.
- `onAgentText(callback)`: hands the agent's words to the HUD for the bottom of the screen.
- Optional `isListening()`: shows a red dot while listening (true = session connected).
- Optional `getVoiceState()`: `'disconnected' | 'connecting' | 'connected'`, so "Hey suit" waits while connecting instead of cancelling.
- Optional `onUserText(callback)`: the astronaut's words, so a session isn't closed while they talk.
- The agent reads the walk state from `window.hud.getStatus()`:
  `{ stop, stop_name, dist_next_m, dist_base_m, o2_pct, o2_minutes_left, must_return, rad_uSv_h, temp_c }`.
  `stop` / `stop_name` / `dist_next_m` are the stop being walked **to** (null / "Base" when heading home). Distances in Mars metres. Unknown numbers are `null`.

## T1.3 sim (module at `/sim/sim.js`)
- `getPosition()` → `{ lat, lon, heading }` on **Mars** (heading in degrees from Mars north).
- `getBackground()` → an image, canvas or video to draw behind the HUD.
- Optional `start()`, `stop()`, `jumpToStop(index)` (used by the demo panel).

## T1.5 live (module at `/live/live.js`)
- `sendTelemetry(object)`: called every second.
- `sendPhoto(blob)`: a 320 px wide JPEG every 2 seconds, field mode only.
- `onMessage(callback)`: Ground Control messages, either a string or `{ text }`.
- As far as we know, new Firebase file storage needs the paid plan, so consider saving the latest photo as text in a database document.

Each module can export these by name, as `default`, or as an object (`live`, `sim`).
