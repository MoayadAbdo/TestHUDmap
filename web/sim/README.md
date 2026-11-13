# web/sim/ (AI3): 3D VR simulation

Walk on Mars at the Mount Sharp boxwork site, in 3D:
- **Real ground:** NASA HiRISE satellite photo draped over heights from Curiosity's measurements (+ fine gravel detail up close).
- **Walk where you look:** hold the clicker (or the screen, in the test page).
- **Glowing beacons** at the 6 stops: walk into the next one to "arrive".
- **Scan rocks:** look at the rock with the cyan outline for 2 s to collect a sample.
- **Curiosity rover** parked at the main site, distant Mount Sharp, Mars sky, dust storms.
- **VR box mode** (two eyes, real 3D depth) or **flat screen** mode.

## Files
| File | What |
|---|---|
| `sim.js` | The 3D simulation (uses three.js) |
| `vendor/three.module.min.js` | three.js r170 (MIT license, saved locally so it works without a CDN) |
| `test.html` | Test page: the sim alone with a small info box and stop cards |
| `test-mission.json` | Test data (real route + 6 stops). The real `mission.json` comes from `builder/` |
| `../mission/terrain/` | Ground photo + heights, made by `builder/terrain.py` |
| `../mission/assets/pano_stopN.jpg` | Real 360° rover photo of each stop, used in the stop cards |

## Try it on a laptop
```bash
cd web
python3 -m http.server 8000 --bind 127.0.0.1
```
Open http://localhost:8000/sim/test.html → **Flat screen**. Hold **Space** to walk, **drag the mouse** to look, **K** = dust storm.
Shortcuts: `test.html?auto=flat&stop=2` starts next to stop 2.

## Try it on a phone
Motion sensors need **HTTPS**: Android over USB (`chrome://inspect` port forwarding to `localhost:8000`), or an HTTPS host (Netlify Drop / Firebase). Tap **VR box**, allow motion access, put the phone in the box, hold the screen or clicker to walk.

## How the HUD uses it
```html
<script type="importmap">{ "imports": { "three": "../sim/vendor/three.module.min.js" } }</script>
<div id="world" style="position:fixed;inset:0"></div>   <!-- 3D view; put the HUD layer on top -->
```
```js
import { sim } from "../sim/sim.js";
await sim.start(mission, { container: document.getElementById("world"), assetsBase: "../mission/", stereo: true });
await sim.enableSensors();                          // from a tap

const pos = sim.getPosition();   // { mars: [lat, lon], heading, pitch, stop, nextStop, dist_next_m, visited, scanned }
sim.on("arrive", ({ stop }) => showStopCard(stop));
sim.on("scan",   ({ stop }) => showSampleCollected(stop));
sim.event("dust");               // dust storm (from Ground Control)
sim.setMoveInput({ forward, right, turn, run });  // steer without walking (-1..1): WASD, gamepad or Ground Control
```
In stereo mode the screen is split in two halves, so the HUD draws its overlay twice (left and right half).

## Rebuild the data
```bash
python3 builder/terrain.py                                   # ground photo + heights
python3 builder/panoramas.py --stop 0 --sol 4596 --search 8  # 360° stop photos (repeat per stop)
```

## Known limits
- Hills follow Curiosity's measured heights, smoothed; small ridges come from the photo's shading (visual only, < 1 m).
- The rover is a simple model (not NASA's detailed 3D model).
- Phones get warm in 3D VR mode: keep sessions short.
