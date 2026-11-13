"""Layer steps with stand-in sources: real heights, stop slopes, mineral overlay transparency."""
import math

import numpy as np
import pytest
from PIL import Image

from orbital import mineral_layers, thermal_layer, topo_layers
from orbital.grid import M_PER_DEG, Bounds
from orbital.raster import Raster
from orbital.site import Site

BOX = Bounds(north=-4.7955, south=-4.8175, west=137.373, east=137.3895)
STEP = 1 / M_PER_DEG                       # about 1 m


def site(stops=()):
    return Site(BOX, (5, 7), (-4.8036, 137.380), -3640.5, list(stops), [{"lat": -4.8036, "lon": 137.380, "slope_deg": 3.0}],
                np.zeros((7, 5), np.float32))


def tilted_dem(deg_east):
    """A 1 m DEM over the box (+ margin) rising to the east at deg_east."""
    west, north = BOX.west - 4 * STEP, BOX.north + 4 * STEP
    cols, rows = int((BOX.east - BOX.west) / STEP) + 9, int((BOX.north - BOX.south) / STEP) + 9
    dx_m = STEP * M_PER_DEG * math.cos(math.radians(-4.8065))
    x = np.arange(cols) * dx_m
    return Raster(np.tile(-3600 + x * math.tan(math.radians(deg_east)), (rows, 1)), west, north, STEP, STEP)


def test_real_heights_are_relative_to_the_base_stop():
    s = site()
    heights, base_elev = topo_layers.real_heights(tilted_dem(10), s)
    assert heights.shape == (7, 5)
    width_m, _ = BOX.size_m()
    base_x = (s.base[1] - BOX.west) / (BOX.east - BOX.west) * width_m
    assert heights[0, 0] == pytest.approx(-base_x * math.tan(math.radians(10)), rel=1e-3)
    assert heights[3, -1] - heights[3, 0] == pytest.approx(width_m * math.tan(math.radians(10)), rel=1e-3)


def test_stop_slopes_read_the_dem_slope_and_the_route():
    s = site([{"id": 0, "name": "Base", "mars": [-4.8036, 137.380]}])
    dem = tilted_dem(12)
    out = topo_layers.stop_slopes(dem, topo_layers.slope_raster(dem), s)
    assert out == [{"id": 0, "name": "Base", "slope_deg": pytest.approx(12.0, abs=0.05),
                    "slope_10m_deg": pytest.approx(12.0, abs=0.05), "route_slope_deg": 3.0}]


def test_class_shares_add_up():
    shares = topo_layers.class_shares(np.array([1.0, 9.0, 20.0, 30.0, np.nan]))
    assert shares == {"easy": 0.25, "careful": 0.25, "steep": 0.5}


class HalfScene:
    """A CRISM stand-in whose scene covers only the west half of the box."""

    def browse(self, scene, product):
        rgba = np.zeros((10, 10, 4), np.uint8)
        rgba[:, :5] = (255, 0, 255, 255)
        dlon, dlat = (BOX.east - BOX.west) / 10, (BOX.north - BOX.south) / 10
        label = ('OBJECT = PNG_DOCUMENT\n DESCRIPTION = "Test."\nEND_OBJECT = PNG_DOCUMENT\n'
                 'START_TIME = 2007-04-22T12:12:12\n'
                 'OBJECT = IMAGE_MAP_PROJECTION\n MAP_SCALE = 0.018\nEND_OBJECT = IMAGE_MAP_PROJECTION\n')
        return Raster(rgba, BOX.west, BOX.north, dlon, dlat), label

    def url(self, scene, product, ext):
        return f"https://example/{scene}.{ext}"


def test_minerals_are_clear_where_the_scene_has_no_data(tmp_path):
    entries = mineral_layers.build(site(), HalfScene(), str(tmp_path))
    assert [e["file"] for e in entries] == ["minerals.png", "minerals_frt0000b6f1.png", "minerals_hrl0000baba.png"]
    assert entries[0]["coverage"] == 0.5 and entries[0]["resolution_m"] == pytest.approx(18.0)
    img = np.asarray(Image.open(tmp_path / "minerals.png"))
    assert img.shape == (12, 8, 4)                           # 2 pixels per grid step
    assert (img[:, :4, 3] == 255).all() and (img[:, 4:, 3] == 0).all()


def test_thermal_range_is_rounded_out_to_tens():
    assert thermal_layer.value_range(np.array([350.2, np.nan, 442.9])) == (350, 450)
