"""Build everything the web app reads, in order: stop photos, mission.json, 3D ground, panoramas.

Usage:
  python builder/build_all.py                     # every step
  python builder/build_all.py --only mission      # one step; repeat --only for more
"""
import argparse

import build_official_mission
import panoramas
import stop_photos
import terrain

PANORAMA_SEARCH = 8         # if a stop's sol has no full circle, try the next sols (same spot only)

STEPS = {
    "photos": stop_photos.main,
    "mission": build_official_mission.main,
    "terrain": terrain.main,
    "panoramas": lambda: panoramas.main(["--all", "--search", str(PANORAMA_SEARCH)]),
}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", action="append", choices=list(STEPS), help="run just this step")
    only = ap.parse_args(argv).only
    for name, step in STEPS.items():
        if not only or name in only:
            print(f"== {name}")
            step()


if __name__ == "__main__":
    main()
