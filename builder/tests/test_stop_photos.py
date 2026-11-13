import os

import pytest

import paths
from stop_photos import fetch_stop_photos, load_photo_picks, sha256
from stops import load_stops


def test_every_stop_has_a_recorded_photo_that_matches_the_committed_file():
    picks = load_photo_picks()
    assert sorted(picks) == [s["id"] for s in load_stops()]
    for stop_id, pick in picks.items():
        assert pick["url"].startswith("https://mars.nasa.gov/") and pick["image_id"]
        assert sha256(os.path.join(paths.ASSETS, f"stop{stop_id}.jpg")) == pick["sha256"]


class FolderCache:
    """Stand-in for DownloadCache: 'downloads' are files already in a folder."""

    def __init__(self, folder):
        self.folder = folder

    def file(self, url, name):
        return os.path.join(self.folder, url.rsplit("/", 1)[-1])


def test_fetch_copies_the_recorded_photo(tmp_path):
    (tmp_path / "a.JPG").write_bytes(b"photo")
    picks = {3: {"url": "https://x/a.JPG", "sha256": sha256(tmp_path / "a.JPG"), "image_id": "A"}}
    fetch_stop_photos(picks, FolderCache(tmp_path), assets=tmp_path / "out")
    assert (tmp_path / "out" / "stop3.jpg").read_bytes() == b"photo"


def test_fetch_refuses_a_different_photo(tmp_path):
    (tmp_path / "a.JPG").write_bytes(b"other photo")
    picks = {3: {"url": "https://x/a.JPG", "sha256": "0" * 64, "image_id": "A"}}
    with pytest.raises(ValueError):
        fetch_stop_photos(picks, FolderCache(tmp_path), assets=tmp_path / "out")
    assert not (tmp_path / "out").exists()
