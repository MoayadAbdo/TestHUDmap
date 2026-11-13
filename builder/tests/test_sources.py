"""Raw-image client and download helper, without the network."""
import urllib.error

import pytest

from download import DownloadCache, download
from sources.raw_images import RawImageClient


def item(imageid, instrument="NAV_LEFT_B", sample_type="full"):
    return {"imageid": imageid, "instrument": instrument, "extended": {"sample_type": sample_type}}


def test_client_reads_every_page_and_sorts_by_image_id():
    pages = [{"items": [item("C"), item("A", sample_type="thumbnail")], "more": True},
             {"items": [item("B"), item("D", instrument="MAST_LEFT")], "more": False}]
    asked = []

    def get_json(url):
        asked.append(url)
        return pages[len(asked) - 1]

    client = RawImageClient(get_json)
    assert [x["imageid"] for x in client.full_frames(4639)] == ["B", "C"]
    assert len(asked) == 2 and all("4639:sol:gte" in u for u in asked)


def test_client_stops_at_an_empty_page():
    client = RawImageClient(lambda url: {"items": [], "more": True})
    assert client.items(1) == []


def test_download_writes_the_file_and_leaves_no_part(tmp_path):
    src = tmp_path / "src.bin"
    src.write_bytes(b"data")
    dst = tmp_path / "sub" / "dst.bin"
    download(src.as_uri(), str(dst))
    assert dst.read_bytes() == b"data"
    assert not (tmp_path / "sub" / "dst.bin.part").exists()


def test_failed_download_leaves_nothing_behind(tmp_path):
    dst = tmp_path / "dst.bin"
    with pytest.raises(urllib.error.URLError):
        download((tmp_path / "missing.bin").as_uri(), str(dst))
    assert not dst.exists() and not (tmp_path / "dst.bin.part").exists()


def test_cache_downloads_once(tmp_path):
    src = tmp_path / "src.json"
    src.write_text('{"v": 1}')
    cache = DownloadCache(str(tmp_path / "cache"))
    assert cache.json(src.as_uri(), "x.json") == {"v": 1}
    src.write_text('{"v": 2}')
    assert cache.json(src.as_uri(), "x.json") == {"v": 1}
