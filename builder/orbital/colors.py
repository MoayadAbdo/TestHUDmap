"""Layer colours and their legends. Images are RGBA uint8; NaN values become transparent."""
import numpy as np

# status colours (good / warning / critical), always shown with a text label
GREEN, AMBER, RED = "#0ca30c", "#fab219", "#d03b3b"
EASY_BELOW_DEG, STEEP_ABOVE_DEG = 8.0, 15.0
SLOPE_LEGEND = [
    {"color": GREEN, "label": f"under {EASY_BELOW_DEG:.0f}° (easy)"},
    {"color": AMBER, "label": f"{EASY_BELOW_DEG:.0f}-{STEEP_ABOVE_DEG:.0f}° (careful)"},
    {"color": RED, "label": f"over {STEEP_ABOVE_DEG:.0f}° (steep)"},
]
# one-hue ramp, light (low) -> dark (high)
BLUE_RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
             "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"]


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))


def to_hex(color):
    return "#" + "".join(f"{int(round(v)):02x}" for v in color[:3])


def slope_classes(deg):
    """RGBA: green under 8°, amber 8-15°, red over 15°."""
    deg = np.asarray(deg, float)
    out = np.zeros(deg.shape + (4,), np.uint8)
    for mask, color in ((deg < EASY_BELOW_DEG, GREEN),
                        ((deg >= EASY_BELOW_DEG) & (deg <= STEEP_ABOVE_DEG), AMBER),
                        (deg > STEEP_ABOVE_DEG, RED)):
        out[mask] = rgb(color) + (255,)
    return out


def ramp_rgb(t, colors=BLUE_RAMP):
    """Colour at position t (0..1) along the ramp, blended between its steps."""
    steps = np.array([rgb(c) for c in colors], float)
    pos = np.clip(np.asarray(t, float), 0, 1) * (len(steps) - 1)
    i = np.minimum(pos.astype(int), len(steps) - 2)
    f = (pos - i)[..., None]
    return steps[i] * (1 - f) + steps[i + 1] * f


def ramp(values, lo, hi, colors=BLUE_RAMP):
    """RGBA for values on the ramp from lo to hi (clipped at both ends)."""
    values = np.asarray(values, float)
    ok = np.isfinite(values)
    out = np.zeros(values.shape + (4,), np.uint8)
    out[ok, :3] = np.round(ramp_rgb((values[ok] - lo) / (hi - lo), colors)).astype(np.uint8)
    out[ok, 3] = 255
    return out


def ramp_legend(lo, hi, steps=5, colors=BLUE_RAMP, unit=""):
    return [{"color": to_hex(ramp_rgb(k / (steps - 1), colors)),
             "label": f"{lo + (hi - lo) * k / (steps - 1):.0f}{unit}"} for k in range(steps)]
