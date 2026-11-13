"""Read a one-band float GeoTIFF on a lat/lon grid (as sent by an ArcGIS ImageServer)."""
import numpy as np
from PIL import Image

from orbital.raster import Raster

TIEPOINT, PIXEL_SCALE, NODATA = 33922, 33550, 42113
NO_DATA_BELOW = -1e30


def read_geotiff(path):
    with Image.open(path) as im:
        tags = im.tag_v2
        i, j, _, west, north, _ = tags[TIEPOINT][:6]
        if (i, j) != (0, 0):
            raise ValueError("tie point is not the top-left pixel corner")
        dlon, dlat = tags[PIXEL_SCALE][:2]
        data = np.asarray(im, np.float64).copy()
        nodata = tags.get(NODATA)
    if nodata is not None:
        data[data == float(str(nodata).strip("\x00"))] = np.nan
    data[data < NO_DATA_BELOW] = np.nan
    return Raster(data, west, north, dlon, dlat)
