"""How far one set of heights is from another."""
import numpy as np


def diff_stats(a, b):
    """Stats of a - b in metres (NaNs skipped): mean, mean size, largest size, RMS, count."""
    d = np.asarray(a, float) - np.asarray(b, float)
    d = d[np.isfinite(d)]
    return {"mean_m": round(float(d.mean()), 2), "mean_abs_m": round(float(np.abs(d).mean()), 2),
            "max_abs_m": round(float(np.abs(d).max()), 2), "rms_m": round(float(np.sqrt((d ** 2).mean())), 2),
            "n": int(d.size)}
