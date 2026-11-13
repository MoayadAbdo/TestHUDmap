# builder/ (AI1, AI3)
Python scripts that download NASA data and write what the web app reads:
`web/mission/mission.json`, `web/mission/assets/` (stop photos, panoramas) and `web/mission/terrain/` (3D ground).
Task: T1.1 (see the project board)

## Setup
```bash
python3 -m venv builder/.venv
builder/.venv/bin/pip install -r builder/requirements.txt
```

## Build
```bash
builder/.venv/bin/python builder/build_all.py                  # photos -> mission -> terrain -> panoramas -> layers
builder/.venv/bin/python builder/build_all.py --only mission   # one step (repeat --only for more)
builder/.venv/bin/python -m pytest builder                     # check mission.json + unit tests
```
| Step | Writes | Cost |
|---|---|---|
| `photos` | `assets/stopN.jpg` from the URLs in `photo_picks.json` (checked by sha256) | 6 photos |
| `mission` | `mission.json` | seconds |
| `terrain` | `terrain/` (HiRISE photo + heights) | ~1 min the first time |
| `panoramas` | `assets/pano_stopN.jpg` + `.json` for every stop | heavy: ~70 Navcam frames + stitching |
| `layers` | `layers/` (map layers + `layers.json`) | ~10 MB of downloads the first time, then seconds |

Downloads are kept in `builder/cache/` (not committed), so later runs reuse them.
After changing `mission.json`, rebuild the voice module: `cd ai && npm run build:hud`.

## Files
| File | What |
|---|---|
| `stops.json` | The stops (place, sol, task, hazard, science). The one place to edit them. |
| `photo_picks.json` | Which NASA raw image each stop photo is (image id, URL, sha256). |
| `build_official_mission.py` | Builds `mission.json`. |
| `route.py`, `slope.py` | Route points and their slope. |
| `stop_photos.py` | Downloads the stop photos by recorded URL; photo credit fields. |
| `terrain.py`, `panoramas.py` | 3D ground and 360° panoramas. |
| `check_slopes.py` | Compares the route slopes with the 3D ground. |
| `layers.py`, `orbital/` | Map layers from orbiters (see below). |
| `sources/` | NASA data (waypoints, REMS weather, raw images, Mars Trek, CRISM, THEMIS). Passed in, so tests use stand-ins. |
| `download.py`, `paths.py` | Download helper (timeout, `.part` file) and folders. |

## Slope
- `route[].slope_deg`: ground slope from that point over at least 10 m of route ahead (short hops are grouped; the last stretch uses the route's last 10 m). The HUD's steep-ground alert (> 12°) reads it.
- `route[].tilt_deg`: rover tilt at that point (wheels on rocks), kept apart because it is not the slope ahead.

## Map layers (`layers.py`)
```bash
builder/.venv/bin/python builder/layers.py          # same as build_all.py --only layers
```
Writes `web/mission/layers/` for the layer switch. Every image covers the terrain box (`terrain.json` bounds,
except `ctx_context.jpg`: 2x the box each way) at 768 x 1024 px (about 1.3 m), unless said otherwise.
`layers.json` lists each layer: id, name, kind, mission, instrument, file, bounds, resolution_m, legend, credit,
source_url, notes (plus per-layer extras such as `stops`).

| File | From | Notes |
|---|---|---|
| `heights_real.bin` | Mars Trek `Gale_DEM_SMG_1m` ImageServer (HiRISE DEM, 1 m, float32) | Same layout as `terrain/heights.bin`, 0 = DEM height at the base. Not used by the sim yet. `compare` in `layers.json` = how it differs from `heights.bin` and the rover waypoints. |
| `slope.png` | the same DEM | Green < 8°, amber 8-15°, red > 15°. Per-stop numbers in `layers.json` (`slope_deg` 1 m, `slope_10m_deg` plane over 10 m). |
| `minerals*.png` | CRISM MTRDR HYD browse PNG + label (PDS Geosciences) | One file per scene (each is stretched on its own). Clear = no data. |
| `thermal.png` | THEMIS thermal inertia ISIS cube (USGS), byte ranges only | One-hue ramp; 100 m blocks kept sharp. |
| `ctx_context.jpg` | Mars Trek `Gale_CTX_BlockAdj_dd` tiles, zoom 12 (~10 m) | Trek's CTX sits ~0.8 km east of the HiRISE mosaic, so it is moved onto the HiRISE photo first (shift in `layers.json`). |

Downloads go to `builder/cache/layers/` and are fetched once. The DEM is asked for on its own 1 m grid
(no server resampling); heights between pixels are read bilinearly, CRISM and THEMIS by nearest pixel.

## Change a stop photo
Find the image in https://mars.nasa.gov/raw_images/ (same sol), put its image id, URL and sha256 in `photo_picks.json`,
then run `build_all.py --only photos --only mission`.

## panoramas.py (AI3): 360° Mars photos for the VR simulation
```bash
builder/.venv/bin/python builder/panoramas.py --all --search 8              # every stop
builder/.venv/bin/python builder/panoramas.py --stop 0 --sol 4596 --search 8
```
Downloads Curiosity's Navcam photos for that sol, lines them up, and writes `web/mission/assets/pano_stopN.jpg` + `.json`.
