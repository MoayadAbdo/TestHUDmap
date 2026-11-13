"""THEMIS (Mars Odyssey) thermal inertia, 100 m pixels, read from the USGS ISIS cube with byte
ranges: only the label and the 128 x 128 tiles under the box are fetched (not the 2.5 GB file)."""
import math
from dataclasses import dataclass

import numpy as np

from orbital import labels
from orbital.raster import Raster

TI_CUBE = ("https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/"
           "Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub")
LABEL_BYTES = 65536
SPECIAL_BELOW = -1e38               # ISIS special pixels (NULL, LRS, HRS ...) sit near -3.4e38


@dataclass(frozen=True)
class CubeLayout:
    start_byte: int                 # 1-based, as in the label
    samples: int
    lines: int
    tile: int
    ulx: float                      # metres
    uly: float
    res: float                      # metres per pixel
    m_per_deg: float
    clon: float

    @classmethod
    def from_label(cls, text):
        core, mapping = labels.section(text, "Core"), labels.section(text, "Mapping")
        pixels = labels.section(core, "Pixels")
        checks = {(core, "Format"): "TILE", (pixels, "Type"): "REAL", (pixels, "ByteOrder"): "LSB",
                  (mapping, "ProjectionName"): "SIMPLECYLINDRICAL", (mapping, "LatitudeType"): "PLANETOCENTRIC",
                  (mapping, "LongitudeDirection"): "POSITIVEEAST"}
        for (block, key), want in checks.items():
            if labels.word(block, key) != want:
                raise ValueError(f"{key} is not {want}")
        if labels.number(core, "TileSamples") != labels.number(core, "TileLines"):
            raise ValueError("only square tiles are handled")
        dims = labels.section(core, "Dimensions")
        return cls(int(labels.number(core, "StartByte")), int(labels.number(dims, "Samples")),
                   int(labels.number(dims, "Lines")), int(labels.number(core, "TileSamples")),
                   labels.number(mapping, "UpperLeftCornerX"), labels.number(mapping, "UpperLeftCornerY"),
                   labels.number(mapping, "PixelResolution"),
                   labels.number(mapping, "EquatorialRadius") * math.pi / 180,
                   labels.number(mapping, "CenterLongitude"))

    def pixel(self, lon, lat):
        """(row, col) of the pixel holding lat/lon."""
        x, y = (lon - self.clon) * self.m_per_deg, lat * self.m_per_deg
        return math.floor((self.uly - y) / self.res), math.floor((x - self.ulx) / self.res)

    def tile_range(self, tile_row, tile_col):
        """(start, length) of one tile in the file. Tiles run row by row; edge tiles are padded."""
        across = math.ceil(self.samples / self.tile)
        nbytes = self.tile * self.tile * 4
        return self.start_byte - 1 + (tile_row * across + tile_col) * nbytes, nbytes

    def corner(self, row, col):
        """lon, lat of the top-left corner of a pixel."""
        return self.clon + (self.ulx + col * self.res) / self.m_per_deg, (self.uly - row * self.res) / self.m_per_deg


def read_window(layout, read_tile, r0, c0, r1, c1):
    """Pixels rows r0..r1, cols c0..c1 (inclusive). read_tile(tile_row, tile_col) -> tile x tile array."""
    t = layout.tile
    out = np.empty((r1 - r0 + 1, c1 - c0 + 1), np.float32)
    for tr in range(r0 // t, r1 // t + 1):
        for tc in range(c0 // t, c1 // t + 1):
            tile = read_tile(tr, tc)
            rs, re_ = max(r0, tr * t), min(r1, tr * t + t - 1)
            cs, ce = max(c0, tc * t), min(c1, tc * t + t - 1)
            out[rs - r0:re_ - r0 + 1, cs - c0:ce - c0 + 1] = tile[rs - tr * t:re_ - tr * t + 1, cs - tc * t:ce - tc * t + 1]
    return out


class ThemisTiSource:
    def __init__(self, cache, url=TI_CUBE):
        self._cache = cache
        self.url = url

    def _layout(self):
        path = self._cache.file(self.url, "layers/themis/ti_label.txt", byte_range=(0, LABEL_BYTES))
        with open(path, "rb") as fh:
            return CubeLayout.from_label(fh.read().split(b"\0", 1)[0].decode("latin-1"))

    def _tile(self, layout, tr, tc):
        path = self._cache.file(self.url, f"layers/themis/ti_tile_{tr}_{tc}.bin", byte_range=layout.tile_range(tr, tc))
        return np.fromfile(path, "<f4").reshape(layout.tile, layout.tile)

    def crop(self, b):
        """Thermal inertia (J m-2 K-1 s-1/2) for the pixels under box b; NaN = no data."""
        layout = self._layout()
        r0, c0 = layout.pixel(b.west, b.north)
        r1, c1 = layout.pixel(b.east, b.south)
        data = read_window(layout, lambda tr, tc: self._tile(layout, tr, tc), r0, c0, r1, c1).astype(np.float64)
        data[data < SPECIAL_BELOW] = np.nan
        west, north = layout.corner(r0, c0)
        step = layout.res / layout.m_per_deg
        return Raster(data, west, north, step, step)
