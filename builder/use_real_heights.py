"""Make the 3D ground use the real 1 m HiRISE DEM heights (made by layers.py) instead of the waypoint-smoothed ones."""
import json
import os
import shutil

from paths import LAYERS, TERRAIN


def use_real_heights(layers_dir=LAYERS, terrain_dir=TERRAIN):
    with open(os.path.join(layers_dir, "layers.json")) as fh:
        real = next(layer for layer in json.load(fh)["layers"] if layer["id"] == "heights")
    terrain_path = os.path.join(terrain_dir, "terrain.json")
    with open(terrain_path) as fh:
        terrain = json.load(fh)
    if list(real["grid"]) != list(terrain["grid"]):
        raise ValueError(f"grid mismatch: {real['grid']} vs {terrain['grid']}")
    shutil.copyfile(os.path.join(layers_dir, real["file"]), os.path.join(terrain_dir, "heights.bin"))
    terrain["source_heights"] = f"{real['instrument']}: {real['credit']} (1 m, resampled to the grid; 0 = base stop)"
    terrain["height_range_m"] = real["height_range_m"]
    with open(terrain_path, "w") as fh:
        json.dump(terrain, fh, indent=1)
        fh.write("\n")
    return terrain


def main():
    print(use_real_heights()["source_heights"])


if __name__ == "__main__":
    main()
