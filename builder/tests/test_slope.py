import math

import pytest

from slope import along_route_m, windowed_grades


def test_even_slope_is_found_everywhere():
    along = [0, 5, 10, 15, 20, 25]
    elev = [a * math.tan(math.radians(10)) for a in along]
    assert windowed_grades(along, elev) == pytest.approx([10.0] * 6)


def test_short_hops_are_grouped_until_the_window_is_reached():
    # a 1 m bump over a 2 m hop would read 26.6°; over the 12 m window it is flat ground
    along = [0, 2, 4, 12]
    elev = [0, 1, 0, 0]
    assert windowed_grades(along, elev, window_m=10)[0] == pytest.approx(0.0)


def test_downhill_counts_as_steep_too():
    assert windowed_grades([0, 10], [0, -10])[0] == pytest.approx(45.0)


def test_last_points_use_the_last_window_of_the_route():
    along = [0, 10, 20, 21]
    elev = [0, 0, 0, 11]
    grades = windowed_grades(along, elev, window_m=10)
    # points 2 and 3 have under 10 m left: both use 10 m -> 21 m (11 m climb over 11 m)
    assert grades[2] == pytest.approx(45.0)
    assert grades[3] == pytest.approx(45.0)


def test_route_shorter_than_the_window_uses_the_whole_route():
    assert windowed_grades([0, 3], [0, 3], window_m=10) == pytest.approx([45.0, 45.0])


def test_single_point_or_no_distance_is_flat():
    assert windowed_grades([0], [5]) == [0.0]
    assert windowed_grades([0, 0], [0, 1]) == [0.0, 0.0]


def test_along_route_adds_up_the_walk():
    pts = [{"lat": 0.0, "lon": 137.0}, {"lat": 1e-4, "lon": 137.0}, {"lat": 2e-4, "lon": 137.0}]
    along = along_route_m(pts)
    step = 3396190 * math.radians(1e-4)
    assert along == pytest.approx([0, step, 2 * step])
