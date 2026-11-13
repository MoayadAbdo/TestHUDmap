"""Location knowledge grid: what the real layers say at every 10 m of the walk area.

Reads the layers in web/mission/layers/ (built by builder/layers.py) and writes
web/mission/knowledge/grid.json, which the HUD reads to answer "what's here?".

Per 10 m cell:
  height_m        height above the base stop (MRO HiRISE 1 m DEM)
  steep_pct       share of the cell steeper than 15 degrees (slope from the same DEM)
  mineral         CRISM hint: 0 none / 1 polyhydrated sulfates / 2 monohydrated sulfates / 3 other hydrated
  mineral_pct     how strong that hint is within its scene (percentile, 0-100)
  ti              apparent thermal inertia, J m-2 K-1 s-1/2 (Mars Odyssey THEMIS, 100 m pixels)

CRISM colours only hint at minerals (each scene is stretched on its own; spectra confirm them),
so the grid stores a hint plus how much it stands out from the rest of that scene.

Usage:  python builder/knowledge.py
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LAYERS = ROOT / "web" / "mission" / "layers"
OUT = ROOT / "web" / "mission" / "knowledge" / "grid.json"
CELL_M = 10.0
MARS_R = 3396190.0
MINERAL_NAMES = {0: "none", 1: "polyhydrated sulfates", 2: "monohydrated sulfates", 3: "other hydrated minerals"}
STRONG_PCT = 85            # a hint counts when it is in the top 15 % of its scene


def load_layers():
    return {l["id"]: l for l in json.loads((LAYERS / "layers.json").read_text())["layers"]}


def rgba(layer):
    return np.asarray(Image.open(LAYERS / layer["file"]).convert("RGBA")).astype(np.float32)


def sample(img, fx, fy):
    """Pixel at fractional image position (0..1, 0..1), nearest neighbour."""
    h, w = img.shape[:2]
    return img[min(h - 1, int(fy * h)), min(w - 1, int(fx * w))]


def mineral_hints(img):
    """Per pixel: class code and percentile strength within this scene."""
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    s = np.maximum(np.maximum(r, g), b)
    flat = s[img[..., 3] > 0]
    pct = np.searchsorted(np.sort(flat), s) / max(1, flat.size) * 100
    cls = np.zeros(s.shape, np.int8)
    k = 0.6 * s
    cls[(r >= k) & (b >= k)] = 1                       # magenta: polyhydrated sulfates
    cls[(cls == 0) & (g >= k) & (g >= r)] = 2          # yellow/green: monohydrated sulfates
    cls[(cls == 0) & (b >= k) & (b > r)] = 3           # blue: other hydrated minerals
    cls[(cls == 0) & (r >= k)] = 1                     # red only: polyhydrated sulfate index
    cls[(pct < STRONG_PCT) | (s < 24)] = 0             # weak: no hint
    return cls, pct


def thermal_inertia(layer, img):
    """THEMIS colour back to a value using the legend ramp."""
    stops = [(np.array([int(c["color"][i:i + 2], 16) for i in (1, 3, 5)], np.float32), float(c["label"])) for c in layer["legend"]]
    cols = np.stack([c for c, _ in stops]); vals = np.array([v for _, v in stops])
    rgb = img[..., :3]
    d = np.linalg.norm(rgb[..., None, :] - cols[None, None, :, :], axis=-1)
    i = np.argsort(d, axis=-1)[..., :2]
    d0 = np.take_along_axis(d, i[..., :1], -1)[..., 0]; d1 = np.take_along_axis(d, i[..., 1:], -1)[..., 0]
    w = d1 / np.maximum(d0 + d1, 1e-6)                 # closer colour gets more weight
    return w * vals[i[..., 0]] + (1 - w) * vals[i[..., 1]]


def main():
    L = load_layers()
    bounds = L["photo"]["bounds"]
    lat0 = (bounds["north"] + bounds["south"]) / 2
    m_lat = MARS_R * math.pi / 180
    m_lon = m_lat * math.cos(math.radians(lat0))
    width_m = (bounds["east"] - bounds["west"]) * m_lon
    height_m = (bounds["north"] - bounds["south"]) * m_lat
    cols, rows = int(width_m // CELL_M), int(height_m // CELL_M)

    hl = L["heights"]
    gw, gh = hl["grid"]
    heights = np.fromfile(LAYERS / hl["file"], "<f4").reshape(gh, gw)
    slope = rgba(L["slope"])
    steep_mask = (slope[..., 0] > 150) & (slope[..., 1] < 100)            # red = over 15 degrees
    scenes = [(k, L[k]) for k in ("minerals", "minerals_frt0000b6f1", "minerals_hrl0000baba") if k in L]
    hints = {k: mineral_hints(rgba(l)) for k, l in scenes}
    ti_layer = L["thermal"]
    ti_img = thermal_inertia(ti_layer, rgba(ti_layer))

    out = {k: [] for k in ("height_m", "steep_pct", "mineral", "mineral_pct", "mineral_scene", "ti")}
    for row in range(rows):
        for col in range(cols):
            fx0, fx1 = col * CELL_M / width_m, (col + 1) * CELL_M / width_m
            fy0, fy1 = row * CELL_M / height_m, (row + 1) * CELL_M / height_m
            fx, fy = (fx0 + fx1) / 2, (fy0 + fy1) / 2
            out["height_m"].append(round(float(sample(heights[..., None], fx, fy)[0]), 1))
            sh, sw = steep_mask.shape
            block = steep_mask[int(fy0 * sh):max(int(fy1 * sh), int(fy0 * sh) + 1), int(fx0 * sw):max(int(fx1 * sw), int(fx0 * sw) + 1)]
            out["steep_pct"].append(int(round(block.mean() * 100)))
            best = (0, 0.0, "")
            for k, _ in scenes:                                            # strongest hint among the scenes
                cls, pct = hints[k]
                c, p = int(sample(cls[..., None], fx, fy)[0]), float(sample(pct[..., None], fx, fy)[0])
                if c and p > best[1]:
                    best = (c, p, k)
            out["mineral"].append(best[0]); out["mineral_pct"].append(int(best[1])); out["mineral_scene"].append(best[2])
            out["ti"].append(int(round(float(sample(ti_img[..., None], fx, fy)[0]))))

    scene_info = {k: {"scene": l.get("scene"), "date": l.get("date"), "resolution_m": l.get("resolution_m")} for k, l in scenes}
    grid = {
        "built_by": "builder/knowledge.py",
        "bounds": bounds, "cell_m": CELL_M, "cols": cols, "rows": rows, "row0": "north",
        "mineral_names": MINERAL_NAMES, "mineral_scenes": scene_info,
        "sources": {
            "height_m": "MRO HiRISE 1 m DEM (Gale_DEM_SMG_1m, Mars Trek), metres above the base stop",
            "steep_pct": "Slope from the same DEM: share of the cell over 15 degrees",
            "mineral": "MRO CRISM HYD browse products (hints only; spectra confirm minerals)",
            "ti": "Mars Odyssey THEMIS apparent thermal inertia, 100 m pixels",
        },
        **out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(grid, separators=(",", ":")))
    hint_share = np.mean(np.array(out["mineral"]) > 0) * 100
    print(f"wrote {OUT.relative_to(ROOT)}: {cols} x {rows} cells of {CELL_M:.0f} m, "
          f"{OUT.stat().st_size // 1024} KB, mineral hints in {hint_share:.0f}% of cells, "
          f"TI {min(out['ti'])}-{max(out['ti'])}")


if __name__ == "__main__":
    main()
