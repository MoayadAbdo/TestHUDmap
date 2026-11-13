"""Build the one official mission file: web/mission/mission.json.

It serves every part of the project, so it carries the fields each part reads:
  HUD (T1.4)     route[].mars + slope_deg, stops[].photo + conditions, anchor, suit
  Voice (T1.2)   mission_name, location, stops[].description + tasks
  Sim (T1.3)     route[].lat/lon, stops[].mars + panorama
  Plan (T1.1)    route[].elev/slope_deg/tilt_deg, stops[].temp_c/rad_uSv_h/sources/photo_credit, layers

slope_deg = ground slope over at least 10 m of route (slope.py); tilt_deg = rover tilt, kept apart.
Data: Curiosity waypoints (route, height, tilt), Curiosity REMS (temperature, pressure per sol),
RAD surface average, stops.json, stop photos recorded in photo_picks.json.

Usage:  python builder/build_official_mission.py
"""
import json

import paths
from download import DownloadCache
from geo import R_MARS, dist_m, nearest_point
from route import build_route
from sources.nasa import NasaWaypointSource
from sources.rems import RemsWeatherSource
from stop_photos import load_photo_picks, photo_fields
from stops import base_stop, load_stops, walk_sols

RAD_uSv_h = 27.9            # Curiosity RAD surface average 0.67 mSv/day (Hassler et al. 2014)
STOP_ON_ROUTE_M = 5.0       # a stop takes slope + tilt from the route point it sits on


def stop_conditions(sol, weather):
    w = weather.get_sol(sol)
    tmin, tmax = w["min_c"], w["max_c"]
    temp = round((tmin + tmax) / 2) if tmin is not None and tmax is not None else None
    return {"temp_c": temp, "pressure_pa": w["pressure_pa"], "rad_uSv_h": RAD_uSv_h,
            "source": f"REMS sol {sol} (average of min {tmin} / max {tmax} °C, pressure); RAD surface average"}


def route_point_at(route, lat, lon):
    p = nearest_point(route, lat, lon)
    return p if dist_m(p["lat"], p["lon"], lat, lon) <= STOP_ON_ROUTE_M else {}


def build_stop(stop, route, weather, pick):
    sid, sol = stop["id"], stop["sol"]
    conditions = stop_conditions(sol, weather)
    here = route_point_at(route, *stop["mars"])
    return {
        "id": sid, "name": stop["name"], **({"is_base": True} if stop.get("is_base") else {}),
        "mars": stop["mars"], "field": None, "sol": sol,
        "slope_deg": here.get("slope_deg"), "tilt_deg": here.get("tilt_deg"), "hazard": stop["hazard"],
        "task": stop["task"], "tasks": [stop["task"]],
        "science": stop["science"], "description": stop["science"],
        "temp_c": conditions["temp_c"], "rad_uSv_h": RAD_uSv_h, "conditions": conditions,
        "photo": f"assets/stop{sid}.jpg", "photos": [f"assets/stop{sid}.jpg"], **photo_fields(stop, pick),
        "panorama": f"assets/pano_stop{sid}.jpg",
        "sources": ["Curiosity waypoints (MMGIS)", f"Curiosity Navcam sol {sol}", f"Curiosity REMS sol {sol}",
                    "NASA/JPL boxwork article 2026-02-23"],
    }


def build_mission(stops, waypoints, weather, photo_picks):
    """stops: stops.json list; waypoints: WaypointSource; weather: WeatherSource; photo_picks: {stop id: pick}."""
    route = build_route(waypoints.get_waypoints(*walk_sols(stops)))
    return {
        "mission_id": "boxwork-01",
        "mission_name": "Mount Sharp Boxwork Walk",
        "location": "Mount Sharp boxwork, Gale Crater, Mars",
        "site": "Mount Sharp boxwork, Gale Crater, Mars",
        "is_mock": False,
        "mars_radius_m": float(R_MARS),
        "anchor": {"mars": base_stop(stops)["mars"], "field": None, "rotation_deg": 0, "scale": 1.0},
        "route": route,
        "layers": [
            {"id": "hirise", "name": "Photo", "mission": "MRO", "instrument": "HiRISE", "kind": "optical",
             "tiles": "https://trek.nasa.gov/tiles/Mars/EQ/curiosity_hirise_mosaic/1.0.0/default/default028mm/{z}/{y}/{x}.png"},
            {"id": "route", "name": "Route slope", "mission": "MSL", "instrument": "Curiosity waypoints", "kind": "topographic"},
            {"id": "weather", "name": "Weather + radiation", "mission": "MSL", "instrument": "REMS / RAD", "kind": "atmospheric"},
        ],
        "stops": [build_stop(s, route, weather, photo_picks.get(s["id"])) for s in stops],
        "suit": {"o2_start_pct": 100, "o2_pct_per_min": 0.25, "walk_speed_mps": 0.8},
    }


def main():
    cache = DownloadCache(paths.CACHE)
    mission = build_mission(load_stops(), NasaWaypointSource(cache), RemsWeatherSource(cache), load_photo_picks())
    with open(paths.MISSION_FILE, "w") as fh:
        json.dump(mission, fh, indent=1)
    print(f"wrote {paths.MISSION_FILE}: {len(mission['route'])} route points, {len(mission['stops'])} stops")
    for s in mission["stops"]:
        print(f"  {s['id']} {s['name']:<13} sol {s['sol']}  {s['temp_c']} °C  {s['conditions']['pressure_pa']} Pa"
              f"  slope {s['slope_deg']}  tilt {s['tilt_deg']}")


if __name__ == "__main__":
    main()
