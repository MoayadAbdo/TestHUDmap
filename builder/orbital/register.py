"""How far one grey picture is shifted from another of the same place and pixel size."""
import numpy as np
from PIL import Image, ImageFilter

BLUR_PX = 8
COARSE_PX = 4


def detail(grey):
    """Picture minus a blurred copy: keeps edges, drops brightness differences between cameras."""
    im = Image.fromarray(np.asarray(grey, np.uint8), "L")
    return np.asarray(im, float) - np.asarray(im.filter(ImageFilter.GaussianBlur(BLUR_PX)), float)


def match(a, b):
    """Correlation of two same-size pictures: 1 = same pattern, 0 = unrelated."""
    a, b = a - a.mean(), b - b.mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))


def best_shift(fixed, moving, margin):
    """(dx, dy, score): the window of `moving` at (margin + dx, margin + dy) that best matches
    `fixed`. `moving` covers fixed's area plus `margin` pixels on every side."""
    f, m = detail(fixed), detail(moving)
    h, w = f.shape

    def score(dx, dy):
        return match(f, m[margin + dy:margin + dy + h, margin + dx:margin + dx + w])

    def search(xs, ys):
        return max((score(dx, dy), dx, dy) for dy in ys for dx in xs)

    _, cx, cy = search(range(-margin, margin + 1, COARSE_PX), range(-margin, margin + 1, COARSE_PX))
    near = lambda c: range(max(-margin, c - COARSE_PX), min(margin, c + COARSE_PX) + 1)
    s, dx, dy = search(near(cx), near(cy))
    return dx, dy, s
