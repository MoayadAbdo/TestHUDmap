"""Ground slope (degrees) from a height grid."""
import numpy as np


def slope_deg(heights, dx_m, dy_m):
    """Slope at every grid point, from the height change to the neighbours on each side."""
    gy, gx = np.gradient(np.asarray(heights, float), dy_m, dx_m)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def plane_slope_deg(heights, dx_m, dy_m):
    """Slope of the flat plane that best fits a patch of heights (least squares)."""
    rows, cols = heights.shape
    y, x = np.mgrid[0:rows, 0:cols]
    a = np.column_stack([x.ravel() * dx_m, y.ravel() * dy_m, np.ones(rows * cols)])
    (gx, gy, _), *_ = np.linalg.lstsq(a, np.asarray(heights, float).ravel(), rcond=None)
    return float(np.degrees(np.arctan(np.hypot(gx, gy))))
