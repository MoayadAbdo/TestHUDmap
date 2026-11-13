"""Build a 360° Mars panorama for one stop from Curiosity's Navcam photos.

How it works:
  1. Ask NASA's raw-image API for all full-size left Navcam photos taken on that sol.
  2. Group them by sequence (the NCAMxxxxx id in the file name). Pick the sequences that
     together go all the way around (each photo has an azimuth = which way the camera pointed).
  3. Place each photo at its azimuth on one long canvas and blend the overlaps.
  4. Save the panorama + a small JSON with the compass direction of its left edge.

Usage:
  python builder/panoramas.py --all --search 8                 # every stop in stops.json, at its sol
  python builder/panoramas.py --stop 0 --sol 4596
  python builder/panoramas.py --stop 1 --sol 4618 --search 6   # try sols 4618..4624 if 4618 has no full circle

  The rover's heading (needed so "north" in the photo = north on Mars) is looked up
  automatically in Curiosity's waypoint file. Later sols are only used if the rover
  did not drive in between (same spot).

Output (in web/mission/assets/):
  pano_stop0.jpg   wide grayscale image, left edge = heading `left_heading_deg`
  pano_stop0.json  { "stop": 0, "sol": 4596, "left_heading_deg": ..., "deg_per_px": ..., "top_el_deg": ..., "frames": [...] }
"""
import argparse
import json
import os
import re
from collections import defaultdict

import numpy as np
from PIL import Image

import paths
from download import DownloadCache, get_json
from sources.nasa import NasaWaypointSource
from sources.raw_images import RawImageClient
from stops import load_stops

NAVCAM_FOV_DEG = 45.0          # Navcam field of view (1024 px wide)
FRAME_PX = 1024
ALL_SOLS = (0, 10 ** 6)


def fetch_frames(client, sol):
    """All full-size left-Navcam frames for a sol, with azimuth/elevation."""
    frames = []
    for x in client.full_frames(sol):
        e = x.get("extended") or {}
        if e.get("mast_az") is None or e.get("mast_el") is None:
            continue
        m = re.search(r"NCAM\d+", x["https_url"])
        frames.append({"url": x["https_url"], "seq": m.group(0) if m else "?",
                       "az": float(e["mast_az"]) % 360, "el": float(e["mast_el"])})
    return frames


def az_gap(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def pick_ring(frames, el_min=-35.0, el_max=5.0, min_sep=15.0):
    """Use whole sequences (biggest first) looking near the horizon, skipping frames
    that point where we already have a photo. Keeps one consistent ring of photos."""
    seqs = defaultdict(list)
    for f in frames:
        if el_min <= f["el"] <= el_max:
            seqs[f["seq"]].append(f)
    picked = []
    for seq in sorted(seqs.values(), key=len, reverse=True):
        for f in seq:
            if all(az_gap(f["az"], p["az"]) >= min_sep for p in picked):
                picked.append(f)
    return sorted(picked, key=lambda f: f["az"])


def rover_pose(wps, sol):
    """Rover pose (lat, lon, yaw) at the end of `sol` = last waypoint on or before it."""
    before = [w for w in wps if w["sol"] <= sol]
    w = max(before, key=lambda w: (w["sol"], w["dist_total_m"]))
    return w["lat"], w["lon"], w["yaw"]


def moved_between(wps, sol_a, sol_b):
    return any(sol_a < w["sol"] <= sol_b for w in wps)


def best_vertical_offset(a, b, dx, max_dy=400, step=4):
    """How many pixels photo b must move down so its overlap with photo a matches best.
    a, b: grayscale arrays; b's centre is dx pixels to the right of a's centre."""
    ov = FRAME_PX - dx
    if ov < 64:
        return None
    A = a[:, dx:][::step, ::step]
    B = b[:, :ov][::step, ::step]
    A = (A - A.mean()) / (A.std() + 1e-6)
    B = (B - B.mean()) / (B.std() + 1e-6)
    best, best_err = 0, np.inf
    n = A.shape[0]
    for d in range(-max_dy // step, max_dy // step + 1):
        if d >= 0:
            ea, eb = A[d:], B[:n - d]
        else:
            ea, eb = A[:n + d], B[-d:]
        if len(ea) < n // 3:
            continue
        err = np.mean(np.abs(ea - eb))
        if err < best_err:
            best, best_err = d, err
    return best * step   # positive: b's content sits lower in a -> b goes down


def stitch(frames, cache):
    ppd = FRAME_PX / NAVCAM_FOV_DEG                     # pixels per degree
    width = int(round(360 * ppd))
    files = [cache.file(f["url"], os.path.join("navcam", f["url"].rsplit("/", 1)[-1])) for f in frames]
    imgs = [np.asarray(Image.open(p).convert("L"), np.float64) for p in files]
    # vertical position of each photo, found by matching the overlap with its neighbour
    ys = [0.0]
    for i in range(1, len(frames)):
        dx = int(round(((frames[i]["az"] - frames[i - 1]["az"]) % 360) * ppd))
        off = best_vertical_offset(imgs[i - 1], imgs[i], dx)
        if off is None:   # no overlap: fall back to the camera's pointing data
            off = int(round((frames[i - 1]["el"] - frames[i]["el"]) * ppd))
        ys.append(ys[-1] + off)
    # close the circle: spread the leftover error evenly so the last photo meets the first
    dx = int(round(((frames[0]["az"] - frames[-1]["az"]) % 360) * ppd))
    off = best_vertical_offset(imgs[-1], imgs[0], dx)
    if off is not None:
        err = ys[-1] + off - ys[0]
        ys = [y - err * i / len(ys) for i, y in enumerate(ys)]
    ys = [int(round(y - np.mean(ys))) for y in ys]
    # elevation of each photo's centre row, averaged (pointing data is noisy, the average is fine)
    el_ref = float(np.mean([f["el"] + y / ppd for f, y in zip(frames, ys)]))
    shifts = [-y for y in ys]
    pad = max(abs(s) for s in shifts) + 2
    height = FRAME_PX + 2 * pad
    acc = np.zeros((height, width), np.float64)
    wsum = np.zeros((height, width), np.float64)
    # feather weight: 1 in the middle of a frame, 0 at its left/right edges
    wx = 1 - np.abs(np.linspace(-1, 1, FRAME_PX))
    wmask = np.tile(wx, (FRAME_PX, 1))
    for f, s, img in zip(frames, shifts, imgs):
        x0 = int(round(f["az"] * ppd - FRAME_PX / 2))
        y0 = pad - s
        cols = (np.arange(FRAME_PX) + x0) % width          # wrap around 360°
        acc[y0:y0 + FRAME_PX, cols] += img * wmask
        wsum[y0:y0 + FRAME_PX, cols] += wmask
    covered = wsum > 1e-6
    pano = acc / np.maximum(wsum, 1e-6)
    gaps = int((~covered.any(axis=0)).sum())
    # keep rows that most columns cover; fill the small missing wedges with the row's average
    keep = np.where(covered.mean(axis=1) >= 0.8)[0]
    top_row = int(keep[0]) if len(keep) else 0
    # elevation (degrees above horizon) of the top row of the final image
    top_el = el_ref + (FRAME_PX / 2 + pad - top_row) / ppd
    if len(keep):
        pano, covered = pano[keep[0]:keep[-1] + 1], covered[keep[0]:keep[-1] + 1]
    for r in range(pano.shape[0]):
        row_ok = covered[r]
        if row_ok.any() and not row_ok.all():
            pano[r, ~row_ok] = pano[r, row_ok].mean()
    return Image.fromarray(np.clip(pano, 0, 255).astype(np.uint8)), ppd, gaps, top_el


def build_panorama(stop, first_sol, client, waypoints, cache, search=0, yaw=None, max_width=4096, out=paths.ASSETS):
    """client: RawImageClient; waypoints: WaypointSource; cache: DownloadCache."""
    wps = waypoints.get_waypoints(*ALL_SOLS)
    best = None
    for sol in range(first_sol, first_sol + search + 1):
        if sol > first_sol and moved_between(wps, first_sol, sol):
            print(f"sol {sol}: rover moved, stop searching")
            break
        frames = pick_ring(fetch_frames(client, sol))
        if len(frames) < 4:
            print(f"sol {sol}: only {len(frames)} usable frames")
            continue
        pano, ppd, gaps, top_el = stitch(frames, cache)
        missing = gaps / ppd
        print(f"sol {sol}: {len(frames)} frames, {missing:.0f}° missing")
        if best is None or missing < best[3]:
            best = (sol, frames, pano, missing, top_el)
        if missing == 0:
            break
    if best is None:
        raise SystemExit("No usable Navcam ring found; try a bigger --search.")
    sol, frames, pano, missing, top_el = best
    yaw = yaw if yaw is not None else rover_pose(wps, sol)[2]
    if missing:
        print(f"warning: {missing:.0f}° of the circle has no photo (black)")
    scale = min(1.0, max_width / pano.width)
    if scale < 1:
        pano = pano.resize((int(pano.width * scale), int(pano.height * scale)), Image.LANCZOS)

    os.makedirs(out, exist_ok=True)
    jpg = os.path.join(out, f"pano_stop{stop}.jpg")
    pano.save(jpg, quality=85)
    meta = {
        "stop": stop, "sol": sol,
        # rover-frame azimuth + rover yaw = compass heading. Left edge of the image is rover az 0.
        "left_heading_deg": round(yaw % 360, 2),
        "missing_deg": round(missing, 1),
        "deg_per_px": round(360 / pano.width, 5),          # same horizontally and vertically
        "top_el_deg": round(top_el, 2),                    # top row = this many degrees above the horizon (negative = below)
        "width_px": pano.width, "height_px": pano.height,
        "source": "Curiosity Navcam (NASA/JPL-Caltech), raw images",
        "frames": [f["url"] for f in frames],
    }
    with open(os.path.join(out, f"pano_stop{stop}.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print(f"saved {jpg} ({pano.width}x{pano.height})")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="every stop in stops.json, at its sol")
    ap.add_argument("--stop", type=int)
    ap.add_argument("--sol", type=int)
    ap.add_argument("--yaw", type=float, help="rover heading; default: looked up in the waypoints")
    ap.add_argument("--search", type=int, default=0, help="also try the next N sols (same spot only)")
    ap.add_argument("--max-width", type=int, default=4096, help="resize so phones can load it")
    a = ap.parse_args(argv)
    if (a.all and (a.stop, a.sol) != (None, None)) or (not a.all and None in (a.stop, a.sol)):
        ap.error("give either --all, or --stop and --sol")
    jobs = [(s["id"], s["sol"]) for s in load_stops()] if a.all else [(a.stop, a.sol)]
    cache = DownloadCache(paths.CACHE)
    client, waypoints = RawImageClient(get_json), NasaWaypointSource(cache)
    for stop, sol in jobs:
        print(f"== panorama for stop {stop} (sol {sol})")
        build_panorama(stop, sol, client, waypoints, cache, search=a.search, yaw=a.yaw, max_width=a.max_width)


if __name__ == "__main__":
    main()
