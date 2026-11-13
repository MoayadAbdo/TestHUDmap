"""Minerals from CRISM HYD browse images: minerals.png (FRT000058A3) plus the other MTRDR scenes
that cover the box, each in its own file (their colours are stretched per scene)."""
import os

from orbital import catalog, files, labels
from orbital.grid import pixel_centres
from sources.crism import png_description

SCENES = [("minerals", "frt000058a3"), ("minerals_frt0000b6f1", "frt0000b6f1"), ("minerals_hrl0000baba", "hrl0000baba")]
PRODUCT = "hyd"
MAIN = "minerals"


def overlay(raster, site):
    """RGBA image of the box, one source pixel per block (no blending); transparent where no data."""
    lon, lat = pixel_centres(site.bounds, *site.image_size)
    return raster.nearest(lon, lat, fill=0)


def build(site, crism, out):
    """crism: CrismBrowseSource."""
    entries = []
    for layer_id, scene in SCENES:
        raster, label = crism.browse(scene, PRODUCT)
        rgba = overlay(raster, site)
        covered = float((rgba[..., 3] > 0).mean())
        if covered == 0:
            print(f"  {scene}: does not cover the terrain box, skipped")
            continue
        name = f"{layer_id}.png"
        files.save_png(rgba, os.path.join(out, name))
        res_m = labels.number(labels.section(label, "IMAGE_MAP_PROJECTION"), "MAP_SCALE") * 1000   # km per pixel
        date = labels.word(label, "START_TIME")[:10]
        print(f"  {scene.upper()} ({date}, {res_m:.0f} m): {covered:.0%} of the box has data -> {name}")
        entries.append(catalog.entry(
            layer_id, "minerals", name, site.bounds, res_m, catalog.HYD_LEGEND, crism.url(scene, PRODUCT, "png"),
            notes=f"Scene {scene.upper()}, {date}. Product label: {png_description(label)}",
            name_extra="" if layer_id == MAIN else f"{date[:4]} scene {scene.upper()}",
            scene=scene.upper(), date=date, coverage=round(covered, 3)))
    return entries
