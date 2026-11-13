"""Heat: THEMIS thermal inertia for the box as thermal.png (100 m blocks kept sharp)."""
import math
import os

import numpy as np

from orbital import catalog, colors, files
from orbital.grid import pixel_centres

ROUND_TO = 10
UNIT = "J m-2 K-1 s-1/2"


def value_range(values):
    """Lowest and highest value, rounded out to the nearest 10."""
    v = values[np.isfinite(values)]
    return math.floor(v.min() / ROUND_TO) * ROUND_TO, math.ceil(v.max() / ROUND_TO) * ROUND_TO


def build(site, themis, out):
    """themis: ThemisTiSource."""
    ti = themis.crop(site.bounds)
    lon, lat = pixel_centres(site.bounds, *site.image_size)
    values = ti.nearest(lon, lat, fill=np.nan)
    lo, hi = value_range(values)
    files.save_png(colors.ramp(values, lo, hi), os.path.join(out, "thermal.png"))
    stops = [{"id": s["id"], "name": s["name"],
              "thermal_inertia": round(float(ti.nearest(s["mars"][1], s["mars"][0], np.nan)))} for s in site.stops]
    finite = values[np.isfinite(values)]
    print(f"  {ti.shape[1]}x{ti.shape[0]} THEMIS pixels, values {finite.min():.0f}..{finite.max():.0f} {UNIT}, "
          f"ramp {lo}..{hi}; stops {[s['thermal_inertia'] for s in stops]}")
    return [catalog.entry("thermal", "thermal", "thermal.png", site.bounds, round(ti.metres_per_pixel()[1]),
                          colors.ramp_legend(lo, hi), themis.url, notes=f"Ramp {lo}-{hi} {UNIT}.",
                          unit=UNIT, value_range=[round(float(finite.min())), round(float(finite.max()))],
                          stops=stops)]
