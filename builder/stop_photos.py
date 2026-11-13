"""Stop photos: which raw image each one is (photo_picks.json), its credit, and the download step.

Usage:  python builder/stop_photos.py     # writes web/mission/assets/stopN.jpg from the recorded URLs
"""
import hashlib
import json
import os
import shutil

import paths
from download import DownloadCache

GENERIC_CREDIT = "NASA/JPL-Caltech"
GENERIC_CAMERA = "Navcam"


def load_photo_picks(path=paths.PHOTO_PICKS_FILE):
    with open(path) as fh:
        return {int(k): v for k, v in json.load(fh).items()}


def photo_fields(stop, pick):
    """photo_credit + photo_source for mission.json. Without a pick: generic credit, no source."""
    if not pick:
        return {"photo_credit": f"{GENERIC_CREDIT}, Curiosity {GENERIC_CAMERA}, sol {stop['sol']}", "photo_source": None}
    return {"photo_credit": f"{pick['credit']}, Curiosity {pick['camera']}, sol {pick['sol']}", "photo_source": pick["url"]}


def sha256(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def fetch_stop_photos(picks, cache, assets=paths.ASSETS):
    for stop_id, pick in sorted(picks.items()):
        src = cache.file(pick["url"], os.path.join("photos", pick["url"].rsplit("/", 1)[-1]))
        if sha256(src) != pick["sha256"]:
            raise ValueError(f"stop {stop_id}: {pick['url']} is not the recorded photo (sha256 differs)")
        dst = os.path.join(assets, f"stop{stop_id}.jpg")
        if os.path.exists(dst) and sha256(dst) == pick["sha256"]:
            print(f"stop{stop_id}.jpg  unchanged ({pick['image_id']})")
            continue
        os.makedirs(assets, exist_ok=True)
        shutil.copyfile(src, dst)
        print(f"stop{stop_id}.jpg  <-  {pick['url']}")


def main():
    fetch_stop_photos(load_photo_picks(), DownloadCache(paths.CACHE))


if __name__ == "__main__":
    main()
