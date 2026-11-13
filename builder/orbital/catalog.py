"""Fixed text for each layer in layers.json (name, kind, mission, instrument, credit, notes)."""

TREK = "JPL Mars Trek (trek.nasa.gov)"
ABOUT = {
    "photo": dict(
        name="Photo", kind="optical", mission="MRO", instrument="HiRISE",
        credit=f"NASA/JPL/University of Arizona (HiRISE), via {TREK}",
        notes="HiRISE black-and-white mosaic of the Curiosity site, contrast boosted. Texture of the 3D ground."),
    "heights": dict(
        name="Heights (real)", kind="topographic", mission="MRO", instrument="HiRISE stereo DEM",
        credit=f"NASA/JPL/University of Arizona (HiRISE), Gale DEM via {TREK}",
        notes=("Real ground heights from the 1 m HiRISE DEM. float32 little-endian metres, row 0 = north edge, "
               "same grid as terrain/heights.bin, 0 = DEM height at the base stop. Not used by the 3D sim yet.")),
    "slope": dict(
        name="Slope", kind="topographic", mission="MRO", instrument="HiRISE stereo DEM",
        credit=f"NASA/JPL/University of Arizona (HiRISE), Gale DEM via {TREK}",
        notes=("Ground slope from the 1 m DEM (height change over 2 m), so boxwork ridge walls show up as red. "
               "stops[].slope_10m_deg is a flat plane fitted over 10 x 10 m, like the route's slope_deg.")),
    "minerals": dict(
        name="Minerals (water-bearing)", kind="spectral", mission="MRO", instrument="CRISM",
        credit="NASA/JPL/JHUAPL (CRISM), MTRDR browse product, PDS Geosciences Node",
        notes=("CRISM HYD browse: red = SINDEX2, green = BD2100_2, blue = BD1900_2. One block = one CRISM pixel "
               "(no smoothing). Each scene is stretched on its own, so colours do not compare across scenes. "
               "Colours hint at minerals; only the full spectra confirm them (Viviano-Beck et al. 2014).")),
    "thermal": dict(
        name="Heat (thermal inertia)", kind="thermal", mission="Mars Odyssey", instrument="THEMIS",
        credit="NASA/JPL/ASU (THEMIS), thermal inertia mosaic by Fergason et al., USGS Astrogeology",
        notes=("Apparent thermal inertia in J m-2 K-1 s-1/2: how slowly the ground warms by day and cools at night. "
               "Loose sand and dust are low, rock and hard ground are high. One block = one 100 m THEMIS pixel "
               "(no smoothing).")),
    "ctx": dict(
        name="Context (CTX)", kind="optical", mission="MRO", instrument="CTX",
        credit=f"NASA/JPL/MSSS (CTX), Gale crater mosaic via {TREK}",
        notes=("Wider view (2x the terrain box each way) for the Ground Control map. Trek serves this mosaic "
               "up to zoom 12 (about 10 m pixels); the CTX images themselves are 5-6 m.")),
}

HYD_LEGEND = [
    {"color": "#ff00ff", "label": "magenta: polyhydrated sulfates (1.9 and 2.4 µm bands)"},
    {"color": "#c8e632", "label": "yellow/green: monohydrated sulfates (2.1 µm band)"},
    {"color": "#3c5aff", "label": "blue: other hydrated minerals"},
    {"color": "#000000", "label": "dark: weak or no band (low end of this scene's stretch)"},
]


def entry(layer_id, about, file, bounds, resolution_m, legend, source_url, notes="", name_extra="", **extra):
    """One layers.json item. `about` = an ABOUT key; `notes` is added after its fixed notes."""
    a = ABOUT[about]
    return {"id": layer_id, "name": ", ".join(n for n in (a["name"], name_extra) if n), "kind": a["kind"], "mission": a["mission"],
            "instrument": a["instrument"], "file": file, "bounds": bounds.as_dict(), "resolution_m": resolution_m,
            "legend": legend, "credit": a["credit"], "source_url": source_url,
            "notes": " ".join(n for n in (a["notes"], notes) if n), **extra}
