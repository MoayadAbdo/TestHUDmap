"""Curiosity waypoints from NASA's MMGIS map file."""

WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"


class NasaWaypointSource:
    def __init__(self, cache):
        self._cache = cache                # anything with .json(url, name), e.g. download.DownloadCache

    def get_waypoints(self, sol_min, sol_max):
        features = self._cache.json(WAYPOINTS_URL, "MSL_waypoints.json")["features"]
        out = []
        for f in features:
            p = f["properties"]
            if p.get("sol") is None or not sol_min <= int(p["sol"]) <= sol_max:
                continue
            out.append({
                "sol": int(p["sol"]), "lat": p["lat"], "lon": p["lon"], "elev": p["elev_geoid"],
                "tilt": p["tilt"], "yaw": float(p["yaw"]), "dist_total_m": p["dist_total_m"],
            })
        return sorted(out, key=lambda w: w["dist_total_m"])
