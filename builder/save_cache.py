"""Save the walk's waypoints to cache/waypoints.json (read by sources/local.py)."""
import json
import os

import paths
from download import DownloadCache
from sources.nasa import NasaWaypointSource
from stops import load_stops, walk_sols

wps = NasaWaypointSource(DownloadCache(paths.CACHE)).get_waypoints(*walk_sols(load_stops()))
os.makedirs(paths.CACHE, exist_ok=True)
with open(os.path.join(paths.CACHE, "waypoints.json"), "w") as f:
    json.dump(wps, f, indent=2)
print(f"Saved {len(wps)} waypoints")
