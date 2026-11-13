"""Terrain box, grid points, image pixels and reading values from a map raster."""
import math

import numpy as np
import pytest

from orbital.grid import M_PER_DEG, Bounds, grid_points, pixel_centres
from orbital.raster import Raster

BOX = Bounds(north=-4.79, south=-4.82, west=137.37, east=137.39)


def test_grid_points_sit_on_the_box_corners_row_0_north():
    lon, lat = grid_points(BOX, 5, 7)
    assert lon.shape == (7, 5)
    assert (lon[0, 0], lon[0, -1], lat[0, 0], lat[-1, 0]) == pytest.approx((137.37, 137.39, -4.79, -4.82))


def test_pixel_centres_are_half_a_pixel_inside_the_box():
    lon, lat = pixel_centres(BOX, 4, 3)
    step_lon, step_lat = 0.02 / 4, 0.03 / 3
    assert lon[0, 0] == pytest.approx(137.37 + step_lon / 2)
    assert lon[0, -1] == pytest.approx(137.39 - step_lon / 2)
    assert lat[0, 0] == pytest.approx(-4.79 - step_lat / 2)
    assert lat[-1, 0] == pytest.approx(-4.82 + step_lat / 2)


def test_scaled_box_keeps_the_centre_and_doubles_each_side():
    big = BOX.scaled(2)
    assert big.centre == pytest.approx(BOX.centre)
    assert (big.east - big.west, big.north - big.south) == pytest.approx((0.04, 0.06))


def test_box_size_in_metres_uses_the_mars_radius():
    w, h = Bounds(1.0, 0.0, 0.0, 1.0).size_m()
    assert h == pytest.approx(3396190 * math.pi / 180)
    assert w == pytest.approx(M_PER_DEG * math.cos(math.radians(0.5)))


def raster_2x2():
    return Raster(np.array([[0.0, 1.0], [2.0, 3.0]]), west=10.0, north=20.0, dlon=1.0, dlat=1.0)


def test_bilinear_is_exact_at_pixel_centres_and_blends_between():
    r = raster_2x2()
    assert r.bilinear(10.5, 19.5) == pytest.approx(0.0)        # centre of pixel (0, 0)
    assert r.bilinear(11.5, 18.5) == pytest.approx(3.0)        # centre of pixel (1, 1)
    assert r.bilinear(11.0, 19.0) == pytest.approx(1.5)        # middle of all four


def test_bilinear_is_nan_outside_the_outer_pixel_centres():
    assert np.isnan(raster_2x2().bilinear(10.2, 19.5))


def test_bilinear_reproduces_a_plane_anywhere():
    y, x = np.mgrid[0:6, 0:8]
    r = Raster(2.0 * x - 3.0 * y, west=0.0, north=0.0, dlon=1.0, dlat=1.0)
    # point at pixel position x = 3.3, y = 2.6 (centres are at +0.5)
    assert r.bilinear(3.8, -3.1) == pytest.approx(2 * 3.3 - 3 * 2.6)


def test_nearest_keeps_blocks_and_fills_outside():
    r = raster_2x2()
    assert r.nearest(np.array([10.1, 10.9, 11.1]), np.array([19.9, 19.1, 18.2]), fill=-1).tolist() == [0, 0, 3]
    assert r.nearest(9.9, 19.5, fill=-1) == -1


def test_nearest_works_on_rgba_images():
    rgba = np.zeros((2, 2, 4), np.uint8)
    rgba[1, 0] = (1, 2, 3, 255)
    out = Raster(rgba, 0.0, 0.0, 1.0, 1.0).nearest(np.array([0.5, 5.0]), np.array([-1.5, -1.5]), fill=0)
    assert out.tolist() == [[1, 2, 3, 255], [0, 0, 0, 0]]


def test_grid_point_raster_reads_back_the_grid_at_its_points():
    heights = np.arange(12.0).reshape(3, 4)
    r = Raster.from_grid_points(heights, BOX)
    lon, lat = grid_points(BOX, 4, 3)
    assert r.bilinear(lon, lat) == pytest.approx(heights)


def test_metres_per_pixel_of_a_one_metre_dem():
    step = 1 / M_PER_DEG
    dx, dy = Raster(np.zeros((10, 10)), 137.0, 0.0, step, step).metres_per_pixel()
    assert dy == pytest.approx(1.0)
    assert dx == pytest.approx(math.cos(math.radians(-5 * step)))
