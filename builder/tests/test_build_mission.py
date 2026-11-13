"""build_mission with stand-in sources (no network)."""
import pytest

from build_official_mission import build_mission


class FakeWaypoints:
    def __init__(self, points):
        self.points = points

    def get_waypoints(self, sol_min, sol_max):
        return [p for p in self.points if sol_min <= p["sol"] <= sol_max]


class FakeWeather:
    def __init__(self, by_sol):
        self.by_sol = by_sol

    def get_sol(self, sol):
        return self.by_sol.get(sol, {"min_c": None, "max_c": None, "pressure_pa": None})


def waypoint(sol, lat, elev, tilt):
    return {"sol": sol, "lat": lat, "lon": 137.0, "elev": elev, "tilt": tilt, "yaw": 0.0, "dist_total_m": lat}


STOPS = [
    {"id": 0, "name": "Base", "is_base": True, "sol": 10, "mars": [-4.8, 137.0], "task": "t0", "hazard": "h0", "science": "s0"},
    {"id": 1, "name": "Ridge", "sol": 12, "mars": [-4.7998, 137.0], "task": "t1", "hazard": "h1", "science": "s1"},
]
WAYPOINTS = FakeWaypoints([waypoint(9, -4.8002, 0, 1.0), waypoint(10, -4.8, 0, 2.0),
                           waypoint(11, -4.7999, 0.5, 9.0), waypoint(12, -4.7998, 1.0, 3.0)])
PICK = {"sol": 10, "camera": "left Navcam", "credit": "NASA/JPL-Caltech", "url": "https://mars.nasa.gov/x.JPG"}


@pytest.fixture
def mission():
    weather = FakeWeather({10: {"min_c": -79, "max_c": -18, "pressure_pa": 703}})
    return build_mission(STOPS, WAYPOINTS, weather, {0: PICK})


def test_route_covers_only_the_walk_sols(mission):
    assert [p["sol"] for p in mission["route"]] == [10, 11, 12]


def test_route_keeps_tilt_apart_from_slope(mission):
    assert [p["tilt_deg"] for p in mission["route"]] == [2.0, 9.0, 3.0]
    # 1 m climb over ~11.9 m of route
    assert all(p["slope_deg"] == pytest.approx(4.8, abs=0.1) for p in mission["route"])


def test_stop_takes_slope_and_tilt_from_its_route_point(mission):
    ridge = mission["stops"][1]
    assert ridge["tilt_deg"] == 3.0 and ridge["slope_deg"] == mission["route"][-1]["slope_deg"]


def test_conditions_and_missing_weather(mission):
    base, ridge = mission["stops"]
    assert base["conditions"]["temp_c"] == -48 and base["conditions"]["pressure_pa"] == 703
    assert ridge["conditions"]["temp_c"] is None


def test_photo_credit_with_and_without_a_recorded_pick(mission):
    base, ridge = mission["stops"]
    assert base["photo_credit"] == "NASA/JPL-Caltech, Curiosity left Navcam, sol 10"
    assert base["photo_source"] == PICK["url"]
    assert ridge["photo_credit"] == "NASA/JPL-Caltech, Curiosity Navcam, sol 12"
    assert ridge["photo_source"] is None


def test_anchor_is_the_base_and_photos_are_relative(mission):
    assert mission["anchor"]["mars"] == [-4.8, 137.0]
    assert mission["stops"][0]["is_base"] is True and "is_base" not in mission["stops"][1]
    assert mission["stops"][1]["photo"] == "assets/stop1.jpg"
