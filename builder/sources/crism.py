"""CRISM (MRO) map-projected browse images (MTRDR) from the PDS Geosciences Node: an RGBA PNG
(alpha 0 = outside the scene) and a PDS3 label with its map projection."""
import numpy as np
from PIL import Image

from orbital import labels
from orbital.raster import Raster

BROWSE = ("https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/"
          "{folder}/{scene}_07_br{product}j_mtr3.{ext}")
SCENES = {"frt000058a3": "2007/2007_112/frt000058a3",
          "frt0000b6f1": "2008/2008_191/frt0000b6f1",
          "hrl0000baba": "2008/2008_202/hrl0000baba"}


def place_browse(label, rgba):
    """Raster for a browse image. PDS: line = LINE_PROJECTION_OFFSET - lat * MAP_RESOLUTION and
    sample = SAMPLE_PROJECTION_OFFSET + lon * MAP_RESOLUTION, counted from 1 at pixel centres
    (matches the ENVI header's corner), so the image edge is half a pixel outside."""
    proj = labels.section(label, "IMAGE_MAP_PROJECTION")
    if labels.word(proj, "MAP_PROJECTION_TYPE") != "EQUIRECTANGULAR" or labels.number(proj, "CENTER_LATITUDE") != 0:
        raise ValueError("only equirectangular labels with centre latitude 0 are handled")
    res = labels.number(proj, "MAP_RESOLUTION")                  # pixels per degree
    lpo, spo = labels.number(proj, "LINE_PROJECTION_OFFSET"), labels.number(proj, "SAMPLE_PROJECTION_OFFSET")
    west = labels.number(proj, "CENTER_LONGITUDE") + (0.5 - spo) / res
    return Raster(rgba, west, (lpo - 0.5) / res, 1 / res, 1 / res)


def png_description(label):
    return labels.quoted(labels.section(label, "PNG_DOCUMENT"), "DESCRIPTION")


class CrismBrowseSource:
    def __init__(self, cache):
        self._cache = cache

    def url(self, scene, product, ext):
        return BROWSE.format(folder=SCENES[scene], scene=scene, product=product, ext=ext)

    def browse(self, scene, product="hyd"):
        """(Raster of RGBA pixels, label text)."""
        lbl = self._cache.file(self.url(scene, product, "lbl"), f"layers/crism/{scene}_{product}.lbl")
        png = self._cache.file(self.url(scene, product, "png"), f"layers/crism/{scene}_{product}.png")
        with open(lbl, encoding="latin-1") as fh:
            label = fh.read()
        with Image.open(png) as im:
            rgba = np.asarray(im.convert("RGBA"))
        return place_browse(label, rgba), label
