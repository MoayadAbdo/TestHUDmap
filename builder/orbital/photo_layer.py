"""The HiRISE photo the 3D ground already uses (terrain/ortho.jpg), listed as the first layer."""
import os

from PIL import Image

from orbital import catalog
from terrain import TILE


def build(site, terrain_dir):
    with Image.open(os.path.join(terrain_dir, "ortho.jpg")) as im:
        width_px = im.width
    width_m, _ = site.bounds.size_m()
    return [catalog.entry("photo", "photo", "../terrain/ortho.jpg", site.bounds, round(width_m / width_px, 2), [],
                          TILE.replace("{row}", "{y}").replace("{col}", "{x}"))]
