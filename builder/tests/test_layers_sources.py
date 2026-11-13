"""Label reading and the map maths of the Trek, CRISM and THEMIS sources, without the network."""
import math

import numpy as np
import pytest
from PIL import Image, TiffImagePlugin, TiffTags

from download import download
from orbital import labels
from orbital.geotiff import read_geotiff
from orbital.grid import Bounds
from orbital.register import best_shift
from sources.crism import place_browse, png_description
from sources.themis import CubeLayout, read_window
from sources.trek import dem_window, tile_index

CRISM_LABEL = """
OBJECT                 = PNG_DOCUMENT
  DESCRIPTION          = "Shows information related to bound water in
    minerals. Blue colors likely indicate other hydrated minerals."
END_OBJECT             = PNG_DOCUMENT
OBJECT              = IMAGE
  LINES             = 735
END_OBJECT = IMAGE
OBJECT                         = IMAGE_MAP_PROJECTION
  MAP_PROJECTION_TYPE          = "EQUIRECTANGULAR"
  A_AXIS_RADIUS                =  3396.190000000000 <KILOMETER>
  CENTER_LATITUDE              =   0.0000000 <DEGREE>
  CENTER_LONGITUDE             =   0.0000000 <DEGREE>
  MAP_RESOLUTION               = 3293.0387513
  MAP_SCALE                    =   0.0180000
  MINIMUM_LATITUDE             =  -4.9092140 <DEGREE>
  MAXIMUM_LATITUDE             =  -4.6863196 <DEGREE>
  WESTERNMOST_LONGITUDE        = 137.3243100 <DEGREE>
  LINE_PROJECTION_OFFSET       = -15431.2316667 <PIXEL>
  SAMPLE_PROJECTION_OFFSET     = -452213.2722222 <PIXEL>
END_OBJECT                     = IMAGE_MAP_PROJECTION
END
"""

ISIS_LABEL = """Object = IsisCube
  Object = Core
    StartByte   = 65537
    Format      = Tile
    TileSamples = 128
    TileLines   = 128
    Group = Dimensions
      Samples = 35565
      Lines   = 17782
      Bands   = 1
    End_Group
    Group = Pixels
      Type       = Real
      ByteOrder  = Lsb
    End_Group
  End_Object
  Group = Mapping
    ProjectionName     = SimpleCylindrical
    CenterLongitude    = 0.0
    EquatorialRadius   = 3396190.0 <meters>
    LatitudeType       = Planetocentric
    LongitudeDirection = PositiveEast
    UpperLeftCornerX   = 7112900.0 <meters>
    UpperLeftCornerY   = 0.0 <meters>
    PixelResolution    = 100.0 <meters/pixel>
  End_Group
End_Object
Object = History
  StartByte = 2532507649
End_Object
End
"""


def test_section_stops_at_its_own_end_line():
    proj = labels.section(CRISM_LABEL, "IMAGE_MAP_PROJECTION")
    assert "MAP_RESOLUTION" in proj and "LINES" not in proj
    core = labels.section(ISIS_LABEL, "Core")
    assert labels.number(labels.section(core, "Dimensions"), "Samples") == 35565
    assert labels.number(core, "StartByte") == 65537          # not the History one


def test_values_numbers_words_and_quoted_text():
    proj = labels.section(CRISM_LABEL, "IMAGE_MAP_PROJECTION")
    assert labels.number(proj, "A_AXIS_RADIUS") == 3396.19
    assert labels.word(proj, "MAP_PROJECTION_TYPE") == "EQUIRECTANGULAR"
    assert png_description(CRISM_LABEL) == ("Shows information related to bound water in minerals. "
                                            "Blue colors likely indicate other hydrated minerals.")
    with pytest.raises(KeyError):
        labels.number(proj, "NOT_THERE")


def test_crism_label_extremes_are_the_edge_pixel_centres():
    r = place_browse(CRISM_LABEL, np.zeros((735, 788, 4), np.uint8))
    half = 0.5 / 3293.0387513
    assert r.west == pytest.approx(137.32431 - half, abs=1e-6)
    assert r.north == pytest.approx(-4.6863196 + half, abs=1e-6)
    # centre of the last row = MINIMUM_LATITUDE
    assert r.north - 734.5 * r.dlat == pytest.approx(-4.909214, abs=1e-6)


def test_crism_rejects_other_projections():
    with pytest.raises(ValueError):
        place_browse(CRISM_LABEL.replace("EQUIRECTANGULAR", "POLAR STEREOGRAPHIC"), np.zeros((2, 2, 4)))


def test_themis_layout_finds_the_tile_bytes_checked_on_the_real_file():
    layout = CubeLayout.from_label(ISIS_LABEL)
    row, col = layout.pixel(137.380074, -4.803606)         # base stop
    assert (row // 128, col // 128) == (22, 80)
    assert layout.tile_range(22, 80) == (406126592, 65536)  # range the server sent for this tile


def test_themis_pixel_corner_round_trip():
    layout = CubeLayout.from_label(ISIS_LABEL)
    lon, lat = layout.corner(2850, 10300)
    tiny = 1e-9
    assert layout.pixel(lon + tiny, lat - tiny) == (2850, 10300)
    assert lon == pytest.approx(10300 * 100 / (3396190 * math.pi / 180) + 7112900 / (3396190 * math.pi / 180))


def test_themis_rejects_untiled_cubes():
    with pytest.raises(ValueError):
        CubeLayout.from_label(ISIS_LABEL.replace("Format      = Tile", "Format      = BandSequential"))


def test_read_window_joins_tiles():
    tile, full = 4, np.arange(12 * 12, dtype=np.float32).reshape(12, 12)
    layout = CubeLayout(1, 12, 12, tile, 0, 0, 1, 1, 0)
    asked = []

    def read_tile(tr, tc):
        asked.append((tr, tc))
        return full[tr * tile:(tr + 1) * tile, tc * tile:(tc + 1) * tile]

    assert read_window(layout, read_tile, 3, 2, 9, 5).tolist() == full[3:10, 2:6].tolist()
    assert sorted(asked) == [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0), (2, 1)]


def test_dem_window_covers_the_box_on_the_dem_grid():
    meta = {"extent": {"xmin": 100.0, "ymax": 0.0}, "pixelSizeX": 0.5, "pixelSizeY": 0.25}
    b = Bounds(north=-1.1, south=-2.0, west=101.2, east=102.0)
    assert dem_window(meta, b, margin_px=0) == (2, 4, 2, 4)
    assert dem_window(meta, b, margin_px=1) == (1, 3, 4, 6)


def test_trek_tile_index_matches_the_tile_checked_over_the_base():
    assert tile_index(137.380074, -4.803606, 16) == (34516, 115554)


def write_geotiff(path, data, west, north, step):
    info = TiffImagePlugin.ImageFileDirectory_v2()
    info[33922] = (0.0, 0.0, 0.0, west, north, 0.0)
    info.tagtype[33922] = TiffTags.DOUBLE
    info[33550] = (step, step, 0.0)
    info.tagtype[33550] = TiffTags.DOUBLE
    Image.fromarray(data.astype(np.float32), "F").save(path, tiffinfo=info)


def test_geotiff_reader_places_the_pixels_and_drops_no_data(tmp_path):
    data = np.array([[-3624.0, -3623.5], [-3.4e38, -3622.0]])
    write_geotiff(tmp_path / "dem.tif", data, 137.37, -4.79, 1e-5)
    r = read_geotiff(str(tmp_path / "dem.tif"))
    assert (r.west, r.north, r.dlon, r.dlat) == pytest.approx((137.37, -4.79, 1e-5, 1e-5))
    assert r.data[0].tolist() == [-3624.0, -3623.5] and np.isnan(r.data[1, 0])


def test_byte_range_needs_a_partial_answer_and_leaves_nothing(tmp_path):
    src = tmp_path / "big.bin"
    src.write_bytes(b"0123456789")
    dst = tmp_path / "part.bin"
    with pytest.raises(OSError):                            # file:// ignores ranges, like a server that would
        download(src.as_uri(), str(dst), byte_range=(2, 3))  # send the whole 2.5 GB
    assert not dst.exists() and not (tmp_path / "part.bin.part").exists()


def test_best_shift_finds_a_known_offset():
    rng = np.random.default_rng(1)
    big = np.asarray(Image.fromarray(rng.integers(0, 255, (140, 160), dtype=np.uint8)).resize((320, 280)))
    margin, h, w = 30, 200, 240
    fixed = big[margin + 9:margin + 9 + h, margin - 13:margin - 13 + w]
    dx, dy, score = best_shift(fixed, big[:h + 2 * margin, :w + 2 * margin], margin)
    assert (dx, dy) == (-13, 9) and score > 0.99
