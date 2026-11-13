# Changes on branch `rama-fixes` (on top of 5f76d9a)

Not pushed to the team repo. See the report for screenshots and the reasons.

## Safety logic (web/hud/js)
- `core/alerts.js`: two slope levels — caution > 12°, **no-go > 20° (NASA Artemis EVA limit)**. Low oxygen now ends the walk (was only a warning). Hazards (`solar`, `o2leak`, `ground` recall) end the walk at once. Every return has a reason. New `alertLevel()`.
- `app.js`:
  - steep-ground alert reads the slope along the **path the arrows show** (A* path), not the rover's line
  - oxygen-reserve check uses the **walk home along the route** (not the straight line), slowed on slopes
  - solar storm: radiation × 40 for 5 minutes, dose climbs, astronaut sent home; O₂ leak and Ground Control recall too
  - voice status reports **radiation now** (it reported the normal value during a storm), plus `return_reason`, `walk_home_min`, `rad_dose_uSv`, `eva_min`
  - telemetry to Ground Control carries the same fields
  - `demo.solarStorm / o2Leak / recall / toggleDetail`
- `core/eva-clock.js` (new): the sim's Mars clock starts at 09:00 local time with daylight left (the real clock put walks at night).
- `core/biosigns.js`: calmer heart rate on an easy walk. `core/readouts.js`: integrity reacts to no-go slope.
- `live/live.js`: Ground Control can only press known demo buttons (was any function by name); storm / leak / recall make the suit react.

## Visor UI (web/hud/js/view/visor)
- `style.js`: one colour per meaning (white = read, amber = labels, **cyan = where to go**, yellow = careful, red = act now); dark outline + shadow instead of coloured glow; backing plates.
- `visor.js`: **focus view** by default (compass, arrow, next stop, oxygen time, radiation, temperature, daylight, mini-map). **All panels** with I key / gamepad Select / Ground Control / `?hud=full`.
- `overlay.js`: one big alert banner that says what to do (+ small chips for the rest), drawn above the stop card; next-stop plate with distance and minutes; cyan arrow.
- `card.js`: text fitted to the card (ellipsis, never runs off), task first and largest, hazard in caution colour, photo credit under the photo.
- `panels.js`: `drawVitals`, `drawDelayTag`, dose with decimals, suit integrity shows OK / CHECK / ALERT and "simulated".
- `ground.js`, `minimap.js`, `compass.js`: path and target in cyan.
- `sim/sim.js`: stop light beams fade when you stand next to them.

## Ground Control (web/gc)
- Status bar: EVA NOMINAL / CAUTION / RETURNING (with reason).
- Readouts: oxygen + time left, radiation now + dose, temperature, heading to, distance, walk home (min), EVA time, heading.
- Map: route coloured by slope with a key (NASA 20° limit), scale bar.
- Events happen **on Mars instantly**; Ground Control's words about them go through the Mars delay. New: Recall to base, Visor focus/full, Jump to next stop.

## Voice (ai/)
- `MissionStatus` / `getStatusTool`: optional `return_reason`, `walk_home_min`, `rad_dose_uSv` passed to the agent when present. `prompt.md` rule 2 says the reason and the minutes home. `web/ai/voice.js` rebuilt.
- **Update the ElevenLabs agent by hand** with the new `prompt.md` text and tool description.

## Docs
- README: judge-facing top section (what it is, how it answers each point of the brief, data credits, the Mars delay scene).

## Tests
- HUD: alerts (no-go, low O₂ returns, hazards, levels), EVA clock, dose text. AI: new status fields.
