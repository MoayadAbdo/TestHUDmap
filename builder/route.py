"""Route points for mission.json, from Curiosity's waypoints."""
from slope import WINDOW_M, along_route_m, windowed_grades


def build_route(waypoints, window_m=WINDOW_M):
    along = along_route_m(waypoints)
    grades = windowed_grades(along, [w["elev"] for w in waypoints], window_m)
    route = []
    for w, grade in zip(waypoints, grades):
        lat, lon = round(w["lat"], 7), round(w["lon"], 7)
        route.append({
            "lat": lat, "lon": lon, "mars": [lat, lon], "sol": w["sol"], "elev": round(w["elev"], 1),
            "slope_deg": round(grade, 1),   # ground slope ahead over >= window_m (HUD steep-ground alert)
            "tilt_deg": w["tilt"],          # rover tilt here (wheels on rocks), not the slope ahead
        })
    return route
