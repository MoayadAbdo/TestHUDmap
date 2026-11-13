"""Write layer files."""
import os

import numpy as np
from PIL import Image


def save_png(rgba, path):
    Image.fromarray(np.asarray(rgba, np.uint8), "RGBA").save(path, optimize=True)
    return path


def save_jpeg(gray, path, quality=88):
    Image.fromarray(np.asarray(gray, np.uint8), "L").save(path, quality=quality)
    return path


def save_heights(heights, path):
    """float32 little-endian, row 0 = north edge (same layout as terrain/heights.bin)."""
    np.asarray(heights).astype("<f4").tofile(path)
    return path


def size_kb(path):
    return round(os.path.getsize(path) / 1024, 1)
