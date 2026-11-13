"""Real heights and slope from the Mars Trek 1 m DEM: heights_real.bin, slope.png, and how the
real heights compare with terrain/heights.bin and with the rover's own waypoint heights."""
import os

import numpy as np

from geo import nearest_point
from orbital import catalog, colors, files
from orbital.compare import diff_stats
from orbital.grid import grid_points, pixel_centres
from orbital.ground_slope import plane_slope_deg, slope_deg
from orbital.raster import Raster

PATCH_M = 10.0              # stop slope over about 10 m, like the route's slope_deg
ALL_SOLS = (0, 10 ** 6)


def real_heights(dem, site):
    """DEM heights at the terrain grid points, minus the DEM height at the base stop."""
    lon, lat = grid_points(site.bounds, *site.grid)
    base_elev = float(dem.bilinear(site.base[1], site.base[0]))
    return dem.bilinear(lon, lat) - base_elev, base_elev


def slope_raster(dem):
    dx, dy = dem.metres_per_pixel()
    return Raster(slope_deg(dem.data, dx, dy), dem.west, dem.north, dem.dlon, dem.dlat)


def patch_slope(dem, lat, lon, size_m=PATCH_M):
    r, c = dem.index(lon, lat)
    dx, dy = dem.metres_per_pixel()
    hx, hy = round(size_m / 2 / dx), round(size_m / 2 / dy)
    return plane_slope_deg(dem.data[r - hy:r + hy + 1, c - hx:c + hx + 1], dx, dy)


def stop_slopes(dem, slope, site):
    out = []
    for s in site.stops:
        lat, lon = s["mars"]
        out.append({"id": s["id"], "name": s["name"],
                    "slope_deg": round(float(slope.bilinear(lon, lat)), 1),
                    "slope_10m_deg": round(patch_slope(dem, lat, lon), 1),
                    "route_slope_deg": nearest_point(site.route, lat, lon).get("slope_deg")})
    return out


def class_shares(deg):
    deg = deg[np.isfinite(deg)]
    return {"easy": round(float((deg < colors.EASY_BELOW_DEG).mean()), 3),
            "careful": round(float(((deg >= colors.EASY_BELOW_DEG) & (deg <= colors.STEEP_ABOVE_DEG)).mean()), 3),
            "steep": round(float((deg > colors.STEEP_ABOVE_DEG).mean()), 3)}


def compare(heights, base_elev, dem, site, waypoints):
    """Real heights vs heights.bin (every grid point) and vs the rover's heights (waypoints in the box)."""
    b = site.bounds
    inside = [w for w in waypoints if b.south <= w["lat"] <= b.north and b.west <= w["lon"] <= b.east]
    lat, lon = np.array([w["lat"] for w in inside]), np.array([w["lon"] for w in inside])
    rover = np.array([w["elev"] for w in inside])
    real = dem.bilinear(lon, lat)
    current = Raster.from_grid_points(site.heights_bin, b).bilinear(lon, lat)
    return {"real_vs_heights_bin": diff_stats(heights, site.heights_bin),
            "real_vs_waypoints": diff_stats(real - base_elev, rover - site.base_elev_m),
            "heights_bin_vs_waypoints": diff_stats(current, rover - site.base_elev_m),
            "dem_minus_rover_elev_m": round(float(np.mean(real - rover)), 2)}


def build(site, dem_source, waypoints, out):
    """dem_source: TrekDemSource; waypoints: WaypointSource."""
    dem = dem_source.crop(site.bounds)
    heights, base_elev = real_heights(dem, site)
    if not np.isfinite(heights).all():
        raise ValueError("the DEM has holes under the terrain grid")
    files.save_heights(heights, os.path.join(out, "heights_real.bin"))

    slope = slope_raster(dem)
    lon, lat = pixel_centres(site.bounds, *site.image_size)
    slope_px = slope.bilinear(lon, lat)
    files.save_png(colors.slope_classes(slope_px), os.path.join(out, "slope.png"))

    report = compare(heights, base_elev, dem, site, waypoints.get_waypoints(*ALL_SOLS))
    stops = stop_slopes(dem, slope, site)
    res_m = round(dem.metres_per_pixel()[1], 2)
    print(f"  DEM {dem.shape[1]}x{dem.shape[0]} px at {res_m} m, base {base_elev:.2f} m, "
          f"heights {heights.min():.1f}..{heights.max():.1f} m")
    for k, v in report.items():
        print(f"  {k}: {v}")
    for s in stops:
        print(f"  stop {s['id']} {s['name']}: {s['slope_deg']}° (1 m), {s['slope_10m_deg']}° (10 m), "
              f"route {s['route_slope_deg']}°")
    source = dem_source.service
    return [
        catalog.entry("heights", "heights", "heights_real.bin", site.bounds, res_m, [], source,
                      grid=list(site.grid), grid_step_m=round(site.bounds.size_m()[0] / (site.grid[0] - 1), 2),
                      base_elev_m=round(base_elev, 2),
                      height_range_m=[round(float(heights.min()), 2), round(float(heights.max()), 2)],
                      compare=report),
        catalog.entry("slope", "slope", "slope.png", site.bounds, res_m, colors.SLOPE_LEGEND, source,
                      image_resolution_m=site.image_resolution_m(), area_share=class_shares(slope_px), stops=stops),
    ]
