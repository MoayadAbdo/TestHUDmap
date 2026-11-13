"""JPL Mars Trek: the Gale 1 m DEM (ArcGIS ImageServer, real heights) and image tiles (WMTS)."""
import math

import numpy as np
from PIL import Image

from orbital.geotiff import read_geotiff
from orbital.raster import Raster

DEM_SERVICE = "https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer"
EXPORT = ("{service}/exportImage?bbox={w!r},{s!r},{e!r},{n!r}&bboxSR=104905&imageSR=104905&size={cols},{rows}"
          "&format=tiff&pixelType=F32&interpolation=RSP_NearestNeighbor&f=image")
TILE = "https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.png"
TILE_PX = 256


def dem_window(meta, b, margin_px):
    """(col, row, cols, rows) of the DEM's own pixels that cover box b plus a margin."""
    x0, y0 = meta["extent"]["xmin"], meta["extent"]["ymax"]
    px, py = meta["pixelSizeX"], meta["pixelSizeY"]
    c0, c1 = math.floor((b.west - x0) / px) - margin_px, math.ceil((b.east - x0) / px) + margin_px
    r0, r1 = math.floor((y0 - b.north) / py) - margin_px, math.ceil((y0 - b.south) / py) + margin_px
    return c0, r0, c1 - c0, r1 - r0


class TrekDemSource:
    """Heights in metres for a box, on the DEM's own 1 m grid (nothing resampled by the server)."""

    def __init__(self, cache, service=DEM_SERVICE):
        self._cache = cache                # anything with .file(url, name) / .json(url, name)
        self.service = service

    def crop(self, b, margin_px=4):
        meta = self._cache.json(self.service + "?f=json", "layers/trek_dem_meta.json")
        c0, r0, cols, rows = dem_window(meta, b, margin_px)
        if cols > meta["maxImageWidth"] or rows > meta["maxImageHeight"]:
            raise ValueError(f"box too big for one request: {cols} x {rows}")
        px, py = meta["pixelSizeX"], meta["pixelSizeY"]
        w, n = meta["extent"]["xmin"] + c0 * px, meta["extent"]["ymax"] - r0 * py
        url = EXPORT.format(service=self.service, w=w, s=n - rows * py, e=w + cols * px, n=n, cols=cols, rows=rows)
        dem = read_geotiff(self._cache.file(url, f"layers/trek_dem_c{c0}_r{r0}_{cols}x{rows}.tif"))
        if not (math.isclose(dem.west, w, abs_tol=px / 100) and math.isclose(dem.north, n, abs_tol=py / 100)):
            raise ValueError("DEM came back at a different place than asked")
        return dem


def tile_index(lon, lat, z):
    """(row, col) of the Trek tile holding lat/lon at zoom z (2 x 1 tiles at zoom 0)."""
    return math.floor((90 - lat) / 180 * 2 ** z), math.floor((lon + 180) / 360 * 2 ** (z + 1))


class TrekTileSource:
    """A grey image for a box, pasted from one Trek layer's tiles (8-bit grey + alpha)."""

    def __init__(self, cache, layer):
        self._cache = cache
        self.layer = layer

    def mosaic(self, b, z):
        r0, c0 = tile_index(b.west, b.north, z)
        r1, c1 = tile_index(b.east, b.south, z)
        img = Image.new("LA", ((c1 - c0 + 1) * TILE_PX, (r1 - r0 + 1) * TILE_PX))
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                path = self._cache.file(TILE.format(layer=self.layer, z=z, row=r, col=c),
                                        f"layers/{self.layer}/{z}_{r}_{c}.png")
                with Image.open(path) as tile:
                    img.paste(tile.convert("LA"), ((c - c0) * TILE_PX, (r - r0) * TILE_PX))
        deg = 180 / 2 ** z / TILE_PX
        return Raster(np.asarray(img), c0 * TILE_PX * deg - 180, 90 - r0 * TILE_PX * deg, deg, deg)
