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
builder/.venv/bin/python builder/build_all.py                  # photos -> mission -> terrain -> panoramas
builder/.venv/bin/python builder/build_all.py --only mission   # one step (repeat --only for more)
builder/.venv/bin/python -m pytest builder                     # check mission.json + unit tests
```
| Step | Writes | Cost |
|---|---|---|
| `photos` | `assets/stopN.jpg` from the URLs in `photo_picks.json` (checked by sha256) | 6 photos |
| `mission` | `mission.json` | seconds |
| `terrain` | `terrain/` (HiRISE photo + heights) | ~1 min the first time |
| `panoramas` | `assets/pano_stopN.jpg` + `.json` for every stop | heavy: ~70 Navcam frames + stitching |

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
| `sources/` | NASA data (waypoints, REMS weather, raw images). Passed in, so tests use stand-ins. |
| `download.py`, `paths.py` | Download helper (timeout, `.part` file) and folders. |

## Slope
- `route[].slope_deg`: ground slope from that point over at least 10 m of route ahead (short hops are grouped; the last stretch uses the route's last 10 m). The HUD's steep-ground alert (> 12°) reads it.
- `route[].tilt_deg`: rover tilt at that point (wheels on rocks), kept apart because it is not the slope ahead.

## Change a stop photo
Find the image in https://mars.nasa.gov/raw_images/ (same sol), put its image id, URL and sha256 in `photo_picks.json`,
then run `build_all.py --only photos --only mission`.

## panoramas.py (AI3): 360° Mars photos for the VR simulation
```bash
builder/.venv/bin/python builder/panoramas.py --all --search 8              # every stop
builder/.venv/bin/python builder/panoramas.py --stop 0 --sol 4596 --search 8
```
Downloads Curiosity's Navcam photos for that sol, lines them up, and writes `web/mission/assets/pano_stopN.jpg` + `.json`.
