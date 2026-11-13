"""Slope from heights, colour classes and ramps, height differences."""
import math

import numpy as np
import pytest

from orbital import colors
from orbital.compare import diff_stats
from orbital.ground_slope import plane_slope_deg, slope_deg


def tilted(rows, cols, dx_m, dy_m, deg_x=0.0, deg_y=0.0):
    y, x = np.mgrid[0:rows, 0:cols]
    return x * dx_m * math.tan(math.radians(deg_x)) + y * dy_m * math.tan(math.radians(deg_y))


def test_slope_of_a_tilted_plane_is_the_same_everywhere():
    assert slope_deg(tilted(5, 6, 2.0, 1.0, deg_x=10), 2.0, 1.0) == pytest.approx(np.full((5, 6), 10.0))
    assert slope_deg(tilted(5, 6, 2.0, 1.0, deg_y=30), 2.0, 1.0) == pytest.approx(np.full((5, 6), 30.0))


def test_slope_combines_both_directions():
    h = tilted(4, 4, 1.0, 1.0, deg_x=45, deg_y=45)        # gradient (1, 1) -> atan(sqrt 2)
    assert slope_deg(h, 1.0, 1.0)[1, 1] == pytest.approx(math.degrees(math.atan(math.sqrt(2))))


def test_flat_ground_has_no_slope():
    assert slope_deg(np.full((3, 3), -3624.0), 1.0, 1.0) == pytest.approx(np.zeros((3, 3)))


def test_plane_fit_ignores_bumps_that_average_out():
    h = tilted(11, 11, 1.0, 1.0, deg_x=12)
    bumps = np.indices((11, 11)).sum(0) % 2 * 0.4 - 0.2     # +-0.2 m checkerboard
    assert plane_slope_deg(h, 1.0, 1.0) == pytest.approx(12.0)
    assert plane_slope_deg(h + bumps, 1.0, 1.0) == pytest.approx(12.0, abs=0.1)


def test_slope_classes_green_amber_red_and_clear_for_no_data():
    out = colors.slope_classes(np.array([0.0, 7.99, 8.0, 15.0, 15.01, np.nan]))
    green, amber, red = (colors.rgb(c) + (255,) for c in (colors.GREEN, colors.AMBER, colors.RED))
    assert [tuple(p) for p in out] == [green, green, amber, amber, red, (0, 0, 0, 0)]


def test_ramp_ends_clip_and_middle():
    ramp3 = ["#000000", "#808080", "#ffffff"]
    out = colors.ramp(np.array([300.0, 350.0, 400.0, 500.0, np.nan]), 300, 400, ramp3)
    assert [tuple(p) for p in out] == [(0, 0, 0, 255), (128, 128, 128, 255), (255, 255, 255, 255),
                                       (255, 255, 255, 255), (0, 0, 0, 0)]


def test_default_ramp_runs_light_to_dark():
    light, dark = colors.ramp(np.array([0.0, 1.0]), 0, 1)[:, :3].sum(1)
    assert light > dark


def test_ramp_legend_labels_the_range():
    legend = colors.ramp_legend(350, 450, steps=5)
    assert [x["label"] for x in legend] == ["350", "375", "400", "425", "450"]
    assert legend[0]["color"] == colors.BLUE_RAMP[0] and legend[-1]["color"] == colors.BLUE_RAMP[-1]


def test_hex_round_trip():
    assert colors.to_hex(colors.rgb("#0ca30c")) == "#0ca30c"


def test_diff_stats_skips_nan():
    s = diff_stats(np.array([1.0, -1.0, 3.0, np.nan]), 0.0)
    assert (s["mean_m"], s["mean_abs_m"], s["max_abs_m"], s["n"]) == (1.0, 1.67, 3.0, 3)
    assert s["rms_m"] == pytest.approx(math.sqrt(11 / 3), abs=0.01)
