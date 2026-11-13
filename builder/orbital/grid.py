"""The terrain box and where its grid points and image pixels sit (lat/lon in degrees)."""
import math
from dataclasses import dataclass

import numpy as np

from geo import R_MARS

M_PER_DEG = R_MARS * math.pi / 180


def m_per_deg_lon(lat):
    return M_PER_DEG * math.cos(math.radians(lat))


@dataclass(frozen=True)
class Bounds:
    north: float
    south: float
    west: float
    east: float

    @classmethod
    def of(cls, d):
        return cls(d["north"], d["south"], d["west"], d["east"])

    def as_dict(self):
        return {"north": self.north, "south": self.south, "west": self.west, "east": self.east}

    @property
    def centre(self):
        return (self.north + self.south) / 2, (self.west + self.east) / 2

    def scaled(self, factor):
        """Same centre, each side `factor` times as long."""
        lat, lon = self.centre
        half_lat, half_lon = (self.north - self.south) * factor / 2, (self.east - self.west) * factor / 2
        return Bounds(lat + half_lat, lat - half_lat, lon - half_lon, lon + half_lon)

    def size_m(self):
        """(width, height) in metres, measured at the centre latitude."""
        return (self.east - self.west) * m_per_deg_lon(self.centre[0]), (self.north - self.south) * M_PER_DEG


def grid_points(b, cols, rows):
    """lon, lat of each point of a heights grid (heights.bin layout): the corner points sit on
    the box corners, row 0 = north edge."""
    return np.meshgrid(np.linspace(b.west, b.east, cols), np.linspace(b.north, b.south, rows))


def pixel_centres(b, width, height):
    """lon, lat of each pixel centre of an image whose edges are the box edges."""
    lon = b.west + (np.arange(width) + 0.5) * (b.east - b.west) / width
    lat = b.north - (np.arange(height) + 0.5) * (b.north - b.south) / height
    return np.meshgrid(lon, lat)
