"""web/mission/mission.json against the shape in web/hud/CONTRACTS.md, plus value ranges."""
import json
import math
import os

import pytest

import paths
from stops import load_stops


def _reject(name):
    raise ValueError(f"{name} in mission.json")


@pytest.fixture(scope="module")
def mission():
    with open(paths.MISSION_FILE) as fh:
        return json.loads(fh.read(), parse_constant=_reject)     # NaN / Infinity fail here


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def is_lat_lon(v):
    return isinstance(v, list) and len(v) == 2 and all(map(is_number, v)) and -90 <= v[0] <= 90 and -180 <= v[1] <= 360


def mission_file(rel):
    return os.path.join(paths.MISSION_DIR, rel)


def test_anchor(mission):
    a = mission["anchor"]
    assert is_lat_lon(a["mars"])
    assert a["field"] is None or is_lat_lon(a["field"])
    assert is_number(a["rotation_deg"]) and is_number(a["scale"]) and a["scale"] > 0


def test_route_points(mission):
    route = mission["route"]
    assert len(route) >= 2
    for p in route:
        assert is_lat_lon(p["mars"])
        assert is_number(p["slope_deg"]) and 0 <= p["slope_deg"] <= 45
        assert is_number(p["tilt_deg"]) and 0 <= p["tilt_deg"] <= 45


def test_stops_have_card_fields(mission):
    stops = mission["stops"]
    assert len({s["id"] for s in stops}) == len(stops)
    assert sum(1 for s in stops if s.get("is_base")) == 1
    for s in stops:
        assert isinstance(s["id"], int)
        assert is_lat_lon(s["mars"])
        for key in ("name", "task", "hazard", "science", "photo", "photo_credit"):
            assert isinstance(s[key], str) and s[key].strip(), (s["id"], key)
        assert f"sol {s['sol']}" in s["photo_credit"]


def test_stop_files_exist_and_are_relative(mission):
    for s in mission["stops"]:
        for rel in [s["photo"], s["panorama"], *s["photos"]]:
            assert not rel.startswith("/"), rel          # relative to mission.json, so subfolder hosting works
            assert os.path.isfile(mission_file(rel)), rel


def test_conditions_in_range(mission):
    for s in mission["stops"]:
        c = s["conditions"]
        assert is_number(c["temp_c"]) and -130 <= c["temp_c"] <= 30
        assert is_number(c["pressure_pa"]) and 100 <= c["pressure_pa"] <= 1500
        assert is_number(c["rad_uSv_h"]) and c["rad_uSv_h"] >= 0


def test_suit(mission):
    suit = mission["suit"]
    assert all(is_number(suit[k]) and suit[k] > 0 for k in ("o2_start_pct", "o2_pct_per_min", "walk_speed_mps"))


def test_stops_come_from_stops_json(mission):
    want = [(s["id"], s["name"], s["sol"], s["mars"]) for s in load_stops()]
    assert [(s["id"], s["name"], s["sol"], s["mars"]) for s in mission["stops"]] == want


def test_terrain_has_credit():
    with open(os.path.join(paths.TERRAIN, "terrain.json")) as fh:
        assert "HiRISE" in json.load(fh)["credit"]
