import json

import numpy as np
import pytest

from use_real_heights import use_real_heights


def _setup(tmp_path, grid=(3, 2)):
    layers, terrain = tmp_path / "layers", tmp_path / "terrain"
    layers.mkdir(); terrain.mkdir()
    np.arange(6, dtype="<f4").tofile(layers / "heights_real.bin")
    (layers / "layers.json").write_text(json.dumps({"layers": [{"id": "heights", "file": "heights_real.bin", "grid": list(grid),
        "height_range_m": [0, 5], "instrument": "HiRISE stereo DEM", "credit": "NASA"}]}))
    (terrain / "terrain.json").write_text(json.dumps({"grid": [3, 2], "height_range_m": [-1, 1]}))
    return layers, terrain


def test_copies_real_heights_and_updates_terrain(tmp_path):
    layers, terrain = _setup(tmp_path)
    t = use_real_heights(str(layers), str(terrain))
    assert t["height_range_m"] == [0, 5]
    assert np.fromfile(terrain / "heights.bin", dtype="<f4").tolist() == [0, 1, 2, 3, 4, 5]


def test_refuses_a_different_grid(tmp_path):
    layers, terrain = _setup(tmp_path, grid=(4, 2))
    with pytest.raises(ValueError):
        use_real_heights(str(layers), str(terrain))
