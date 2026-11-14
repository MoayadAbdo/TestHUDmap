"""Find the real boulders in the HiRISE photo, so the 3D rocks stand where Mars has them.

From orbit a boulder is a small dark shadow with a bright sunlit side next to it. We look for small, compact dark
spots that are much darker than the ground around them, with a brighter spot on the sun's side (the sun's direction
is measured from the photo itself). Long thin shadows are ridge walls (boxwork), not boulders, so they are skipped.
The photo is ~0.63 m a pixel, so only boulders of about 1 m and up can be seen; smaller stones can't be.

Output: web/mission/terrain/boulders.json  { source, m_per_px, sun_from_deg, boulders: [[lat, lon, size_m], ...] }
Usage:  python builder/boulders.py            (uses the cached photo tiles from terrain.py)
"""
import json
import math
import os
from collections import deque

import numpy as np
from PIL import Image

import paths
from download import DownloadCache
from terrain import COLS, CREDIT, ROWS, T, TILE

DARK_SIGMA = 2.6          # this many local spreads darker than the ground around it
MIN_PX, MAX_PX = 2, 14    # shadow size in pixels (~1.3 m to ~4 m boulders)
MAX_STRETCH = 2.6         # longer than this (length / width): a ridge wall, not a boulder
LIT_MIN = 0.6             # the sunlit side must be at least this many spreads brighter than the shadow's ring

STEPS = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def load_photo(cache):
    """The raw (not contrast-boosted) grayscale photo and its bounds."""
    w, h = 256 * len(COLS), 256 * len(ROWS)
    photo = Image.new("L", (w, h))
    for i, r in enumerate(ROWS):
        for j, c in enumerate(COLS):
            tile = cache.file(TILE.format(row=r, col=c), os.path.join("hirise", f"{r}_{c}.png"))
            photo.paste(Image.open(tile).convert("L"), (j * 256, i * 256))
    bounds = {"west": COLS[0] * T - 180, "east": (COLS[-1] + 1) * T - 180,
              "north": 90 - ROWS[0] * T, "south": 90 - (ROWS[-1] + 1) * T}
    return photo, bounds


def box_mean(a, r):
    """Mean of the (2r+1)² square around every pixel (edges padded)."""
    p = np.pad(a, r + 1, mode="edge").astype(np.float64)
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return (s[: a.shape[0], : a.shape[1]] / (k * k)).astype(np.float32)


def local_stats(photo, radius=6):
    """Mean and spread of the ground around every pixel."""
    a = np.asarray(photo, np.float32)
    mean, sq = box_mean(a, radius), box_mean(a * a, radius)
    spread = np.sqrt(np.maximum(sq - mean * mean, 1.0))
    return a, mean, spread


def blobs(mask, max_px=MAX_PX * 4):
    """Connected groups of True pixels (8-neighbour), each a list of (y, x). Big groups are dropped early."""
    seen = np.zeros_like(mask, bool)
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        group, todo = [], deque([(y0, x0)])
        seen[y0, x0] = True
        while todo:
            y, x = todo.popleft()
            group.append((y, x))
            for dy, dx in STEPS:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    todo.append((ny, nx))
        if len(group) <= max_px:
            yield group


def stretch(group):
    """Length / width of a group of pixels (1 = round)."""
    p = np.array(group, np.float32)
    if len(p) < 3:
        return 1.0
    ev = np.linalg.eigvalsh(np.cov(p.T) + np.eye(2) * 0.25)
    return math.sqrt(ev[1] / ev[0])


def ring_offset(a, mean, spread, cy, cx, angle, dist=2.0):
    """How much brighter than its ground the pixel `dist` away in direction `angle` is (in spreads)."""
    y, x = int(round(cy - dist * math.cos(angle))), int(round(cx + dist * math.sin(angle)))
    if not (0 <= y < a.shape[0] and 0 <= x < a.shape[1]):
        return 0.0
    return (a[y, x] - mean[y, x]) / spread[y, x]


def sun_direction(a, mean, spread, spots):
    """Which way the sun is (radians, 0 = north, clockwise): the side where shadows have their brightest neighbour."""
    angles = [k * math.pi / 8 for k in range(16)]
    score = [np.mean([ring_offset(a, mean, spread, cy, cx, ang) for cy, cx in spots]) for ang in angles]
    return angles[int(np.argmax(score))]


def find_boulders(photo):
    """[(y, x, size_px)] of the boulders in the photo, and the sun direction used."""
    a, mean, spread = local_stats(photo)
    dark = (mean - a) / spread > DARK_SIGMA
    shadows = []
    for g in blobs(dark):
        if MIN_PX <= len(g) <= MAX_PX and stretch(g) <= MAX_STRETCH:
            cy, cx = np.mean(g, axis=0)
            shadows.append((cy, cx, len(g)))
    sun = sun_direction(a, mean, spread, [(cy, cx) for cy, cx, _ in shadows[:4000]])
    found = []
    for cy, cx, n in shadows:
        reach = 1.0 + math.sqrt(n) / 2
        if ring_offset(a, mean, spread, cy, cx, sun, reach) >= LIT_MIN:   # a lit side on the sun's side
            found.append((cy, cx, n))
    return found, sun


def main(out=paths.TERRAIN):
    cache = DownloadCache(paths.CACHE)
    photo, b = load_photo(cache)
    w, h = photo.size
    m_lon = (b["east"] - b["west"]) / w
    m_lat = (b["north"] - b["south"]) / h
    meta = json.load(open(os.path.join(out, "terrain.json")))
    m_per_px = meta["width_m"] / w
    found, sun = find_boulders(photo)
    rows = []
    for cy, cx, n in found:
        lat = b["north"] - (cy + 0.5) * m_lat
        lon = b["west"] + (cx + 0.5) * m_lon
        size = min(4.0, max(0.9, 1.2 * math.sqrt(n) * m_per_px))     # shadow width ≈ boulder size
        rows.append([round(lat, 7), round(lon, 7), round(size, 2)])
    data = {
        "source": f"Boulders found in the HiRISE photo ({CREDIT}): dark shadow + sunlit side, ~1 m and up",
        "m_per_px": round(m_per_px, 3),
        "sun_from_deg": round(math.degrees(sun)),
        "boulders": rows,
    }
    with open(os.path.join(out, "boulders.json"), "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"{len(rows)} boulders, sun from {data['sun_from_deg']}°, {m_per_px:.2f} m/px")


if __name__ == "__main__":
    main()
