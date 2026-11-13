"""A wider CTX view (2x the box each way) for the Ground Control map: ctx_context.jpg.
Trek's CTX mosaic sits about 1 km east of the HiRISE mosaic (which matches the DEM and the
rover), so it is first moved onto the HiRISE photo by the shift that matches best."""
import os

import numpy as np

from orbital import catalog, files
from orbital.grid import Bounds, m_per_deg_lon, M_PER_DEG, pixel_centres
from orbital.raster import Raster
from orbital.register import best_shift
from sources.trek import TILE

LAYER, ZOOM, WIDER = "Gale_CTX_BlockAdj_dd", 12, 2
HIRISE_LAYER = "curiosity_hirise_mosaic"         # the photo's mosaic, used as the reference
SEARCH_PX = 130             # look for the shift up to ~1.3 km each way
MIN_MATCH = 0.25            # below this the pictures don't match: stop rather than guess


def grey(src, box, cols, rows):
    """Grey pixels of a tile mosaic at the pixel centres of box; black where no data."""
    lon, lat = pixel_centres(box, cols, rows)
    g = Raster(src.data[..., 0], src.west, src.north, src.dlon, src.dlat).bilinear(lon, lat)
    alpha = src.nearest(lon, lat, fill=0)[..., 1]
    return np.where((alpha > 0) & np.isfinite(g), np.round(g), 0).astype(np.uint8)


def grow(box, cols, rows, px):
    """The box plus px pixels on every side (same pixel grid)."""
    dlon, dlat = (box.east - box.west) / cols, (box.north - box.south) / rows
    return Bounds(box.north + px * dlat, box.south - px * dlat, box.west - px * dlon, box.east + px * dlon)


def build(site, ctx_tiles, hirise_tiles, out):
    """ctx_tiles / hirise_tiles: TrekTileSource for each layer."""
    box = site.bounds.scaled(WIDER)
    hirise = hirise_tiles.mosaic(box, ZOOM)
    dx_m, dy_m = hirise.metres_per_pixel()
    width_m, height_m = box.size_m()
    cols, rows = round(width_m / dx_m), round(height_m / dy_m)
    big = grow(box, cols, rows, SEARCH_PX)
    ctx = grey(ctx_tiles.mosaic(big, ZOOM), big, cols + 2 * SEARCH_PX, rows + 2 * SEARCH_PX)
    dx, dy, score = best_shift(grey(hirise, box, cols, rows), ctx, SEARCH_PX)
    if score < MIN_MATCH:
        raise ValueError(f"CTX does not match the HiRISE photo (best {score:.2f}); not placing it")
    image = ctx[SEARCH_PX + dy:SEARCH_PX + dy + rows, SEARCH_PX + dx:SEARCH_PX + dx + cols]
    files.save_jpeg(image, os.path.join(out, "ctx_context.jpg"))

    lat = box.centre[0]
    east_m = dx * (box.east - box.west) / cols * m_per_deg_lon(lat)
    south_m = dy * (box.north - box.south) / rows * M_PER_DEG
    res_m = round(height_m / rows, 1)
    print(f"  {cols}x{rows} px at {res_m} m; CTX moved {east_m:.0f} m west, {south_m:.0f} m north "
          f"to match HiRISE (match {score:.2f})")
    return [catalog.entry("ctx", "ctx", "ctx_context.jpg", box, res_m, [],
                          TILE.format(layer=LAYER, z=ZOOM, row="{y}", col="{x}"),
                          notes=(f"Trek's CTX mosaic is {east_m:.0f} m east and {south_m:.0f} m south of the HiRISE "
                                 f"mosaic here; this image is moved back by that much (match {score:.2f}), "
                                 "so it lines up with the photo, DEM and rover route."),
                          shift_m={"east": round(east_m), "south": round(south_m)}, match=round(score, 2))]
