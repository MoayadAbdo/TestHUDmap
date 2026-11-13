"""What every layer step needs about the walk: the terrain box and grid, the base stop, the stops."""
import json
import os
from dataclasses import dataclass

import numpy as np

from orbital.grid import Bounds

IMAGE_SCALE = 2             # layer images have 2 pixels per heights-grid step (half the photo's pixels)


@dataclass
class Site:
    bounds: Bounds
    grid: tuple             # (cols, rows) of the heights grid
    base: tuple             # (lat, lon) of the base stop
    base_elev_m: float      # rover height at the base = zero of terrain/heights.bin
    stops: list             # mission.json stops
    route: list             # mission.json route
    heights_bin: np.ndarray  # current terrain/heights.bin, rows x cols

    @classmethod
    def load(cls, terrain_dir, mission_file):
        with open(os.path.join(terrain_dir, "terrain.json")) as fh:
            meta = json.load(fh)
        with open(mission_file) as fh:
            mission = json.load(fh)
        cols, rows = meta["grid"]
        heights = np.fromfile(os.path.join(terrain_dir, "heights.bin"), "<f4").reshape(rows, cols)
        return cls(Bounds.of(meta["bounds"]), (cols, rows), (meta["base"]["lat"], meta["base"]["lon"]),
                   meta["base"]["elev_m"], mission["stops"], mission["route"], heights)

    @property
    def image_size(self):
        cols, rows = self.grid
        return IMAGE_SCALE * (cols - 1), IMAGE_SCALE * (rows - 1)

    def image_resolution_m(self):
        width_m, _ = self.bounds.size_m()
        return round(width_m / self.image_size[0], 2)
