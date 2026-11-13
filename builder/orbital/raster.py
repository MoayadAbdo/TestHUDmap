"""A map image on a lat/lon grid: pixel (0, 0) has its top-left corner at (west, north),
every pixel is dlon x dlat degrees. Reads values at any lat/lon."""
from dataclasses import dataclass

import numpy as np

from orbital.grid import M_PER_DEG, m_per_deg_lon

EDGE_PX = 1e-6              # rounding slack at the outer pixel centres


@dataclass
class Raster:
    data: np.ndarray            # rows x cols, or rows x cols x bands
    west: float
    north: float
    dlon: float
    dlat: float

    @classmethod
    def from_grid_points(cls, data, b):
        """A heights grid whose corner points sit on the box corners (heights.bin layout)."""
        rows, cols = data.shape
        dlon, dlat = (b.east - b.west) / (cols - 1), (b.north - b.south) / (rows - 1)
        return cls(data, b.west - dlon / 2, b.north + dlat / 2, dlon, dlat)

    @property
    def shape(self):
        return self.data.shape[:2]

    def metres_per_pixel(self):
        rows, _ = self.shape
        mid_lat = self.north - rows * self.dlat / 2
        return self.dlon * m_per_deg_lon(mid_lat), self.dlat * M_PER_DEG

    def _xy(self, lon, lat):
        """Pixel position; whole numbers are pixel centres."""
        return ((np.asarray(lon, float) - self.west) / self.dlon - 0.5,
                (self.north - np.asarray(lat, float)) / self.dlat - 0.5)

    def index(self, lon, lat):
        """(row, col) of the pixel that holds lat/lon."""
        x, y = self._xy(lon, lat)
        return np.floor(y + 0.5).astype(int), np.floor(x + 0.5).astype(int)

    def nearest(self, lon, lat, fill):
        """Value of the pixel that holds each point (no blending); `fill` outside the image."""
        r, c = self.index(lon, lat)
        rows, cols = self.shape
        inside = (r >= 0) & (r < rows) & (c >= 0) & (c < cols)
        out = np.full(r.shape + self.data.shape[2:], fill, dtype=self.data.dtype)
        out[inside] = self.data[r[inside], c[inside]]
        return out

    def bilinear(self, lon, lat):
        """One-band values blended from the 4 nearest pixel centres; NaN outside the outer pixel centres."""
        x, y = self._xy(lon, lat)
        rows, cols = self.shape
        inside = (x >= -EDGE_PX) & (x <= cols - 1 + EDGE_PX) & (y >= -EDGE_PX) & (y <= rows - 1 + EDGE_PX)
        x, y = np.clip(x, 0, cols - 1), np.clip(y, 0, rows - 1)
        i, j = np.minimum(x.astype(int), cols - 2), np.minimum(y.astype(int), rows - 2)
        fx, fy = x - i, y - j
        d = self.data.astype(np.float64)
        v = ((d[j, i] * (1 - fx) + d[j, i + 1] * fx) * (1 - fy)
             + (d[j + 1, i] * (1 - fx) + d[j + 1, i + 1] * fx) * fy)
        return np.where(inside, v, np.nan)
