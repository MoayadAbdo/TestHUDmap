"""Build the map layers for the layer switch (web/mission/layers/): real heights + slope (Mars Trek
1 m DEM), minerals (CRISM), heat (THEMIS), a wider CTX view, and layers.json describing them.
Downloads stay in builder/cache/layers/ and are fetched once, so later runs work from the cache.

Usage:  python builder/layers.py
"""
import json
import os

import paths
from download import DownloadCache
from orbital import context_layer, mineral_layers, photo_layer, thermal_layer, topo_layers
from orbital.files import size_kb
from orbital.site import Site
from sources.crism import CrismBrowseSource
from sources.nasa import NasaWaypointSource
from sources.themis import ThemisTiSource
from sources.trek import TrekDemSource, TrekTileSource


def build_layers(site, dem, waypoints, crism, themis, ctx_tiles, hirise_tiles,
                 terrain_dir=paths.TERRAIN, out=paths.LAYERS):
    """Each source is passed in (see sources/), so tests and other runs can swap them."""
    os.makedirs(out, exist_ok=True)
    steps = [("photo", lambda: photo_layer.build(site, terrain_dir)),
             ("heights + slope", lambda: topo_layers.build(site, dem, waypoints, out)),
             ("minerals", lambda: mineral_layers.build(site, crism, out)),
             ("heat", lambda: thermal_layer.build(site, themis, out)),
             ("context", lambda: context_layer.build(site, ctx_tiles, hirise_tiles, out))]
    entries = []
    for name, step in steps:
        print(f"-- {name}")
        entries += step()
    with open(os.path.join(out, "layers.json"), "w") as fh:
        json.dump({"built_by": "builder/layers.py", "layers": entries}, fh, indent=2, ensure_ascii=False)
    for e in entries:
        path = os.path.normpath(os.path.join(out, e["file"]))
        print(f"  {e['id']:22} {e['file']:24} {size_kb(path):8} KB")
    return entries


def main():
    cache = DownloadCache(paths.CACHE)
    site = Site.load(paths.TERRAIN, paths.MISSION_FILE)
    build_layers(site, TrekDemSource(cache), NasaWaypointSource(cache), CrismBrowseSource(cache),
                 ThemisTiSource(cache), TrekTileSource(cache, context_layer.LAYER),
                 TrekTileSource(cache, context_layer.HIRISE_LAYER))


if __name__ == "__main__":
    main()
