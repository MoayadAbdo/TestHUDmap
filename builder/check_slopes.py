"""Compare the route slopes in mission.json with the 3D ground (web/mission/terrain/heights.bin).

Usage:  python builder/check_slopes.py [--mission path/to/mission.json]
"""
import argparse
import json
import os

import numpy as np

import paths
from hazards import HAZARD_LIMIT_DEG
from slope import along_route_m, windowed_grades

HUD_LOOK_AHEAD_M = 30.0     # same as slopeAhead() in web/hud/js/core/route.js


def load_ground(folder=paths.TERRAIN):
    with open(os.path.join(folder, "terrain.json")) as fh:
        meta = json.load(fh)
    gw, gh = meta["grid"]
    return meta, np.fromfile(os.path.join(folder, "heights.bin"), "<f4").reshape(gh, gw)


def ground_height(meta, heights, lat, lon):
    """Height at lat/lon, read between grid points. Row 0 = north edge, column 0 = west edge."""
    b, (gh, gw) = meta["bounds"], heights.shape
    x = (lon - b["west"]) / (b["east"] - b["west"]) * (gw - 1)
    y = (b["north"] - lat) / (b["north"] - b["south"]) * (gh - 1)
    i, j = min(int(x), gw - 2), min(int(y), gh - 2)
    fx, fy = x - i, y - j
    top = heights[j, i] * (1 - fx) + heights[j, i + 1] * fx
    bottom = heights[j + 1, i] * (1 - fx) + heights[j + 1, i + 1] * fx
    return float(top * (1 - fy) + bottom * fy)


def walk_share(along, steep):
    """Share of the walk on stretches that start at a steep point."""
    total = along[-1] or 1.0
    return sum(along[i + 1] - along[i] for i in range(len(along) - 1) if steep[i]) / total


def hud_alert_share(along, slopes, limit, look_ahead=HUD_LOOK_AHEAD_M, step_m=1.0):
    """Share of the walk where the HUD's look-ahead alert would be on."""
    on = n = 0
    for s in np.arange(0.0, along[-1], step_m):
        k = int(np.argmin([abs(a - s) for a in along]))
        ahead = [slopes[j] for j in range(k, len(along)) if along[j] - along[k] <= look_ahead]
        on += max(ahead) > limit
        n += 1
    return on / max(n, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mission", default=paths.MISSION_FILE)
    route = json.load(open(ap.parse_args().mission))["route"]
    meta, heights = load_ground()
    along = along_route_m(route)
    slopes = [p["slope_deg"] for p in route]
    ground = windowed_grades(along, [ground_height(meta, heights, p["lat"], p["lon"]) for p in route])
    steep = [s > HAZARD_LIMIT_DEG for s in slopes]
    steep_ground = [g > HAZARD_LIMIT_DEG for g in ground]
    both = sum(a and b for a, b in zip(steep, steep_ground))
    agree = sum(a == b for a, b in zip(steep, steep_ground))
    print(f"route: {len(route)} points, {along[-1]:.0f} m, limit {HAZARD_LIMIT_DEG}°")
    print(f"points over the limit: {sum(steep)}   max slope {max(slopes):.1f}°")
    print(f"walk over the limit: {walk_share(along, steep):.0%}   HUD alert on (30 m look-ahead): "
          f"{hud_alert_share(along, slopes, HAZARD_LIMIT_DEG):.0%}")
    print(f"3D ground (10 m windows): {sum(steep_ground)} points over the limit, max {max(ground):.1f}°")
    print(f"steep on both: {both}   route and ground agree (steep or not): {agree} of {len(route)}")


if __name__ == "__main__":
    main()
