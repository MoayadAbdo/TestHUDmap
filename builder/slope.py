"""Ground slope along the route, measured over a window so short hops between waypoints
(and small height errors) don't turn into fake steep ground."""
import math

from geo import dist_m

WINDOW_M = 10.0


def along_route_m(points):
    """Distance walked from the first point to each point (metres). points: dicts with lat, lon."""
    along = [0.0]
    for a, b in zip(points, points[1:]):
        along.append(along[-1] + dist_m(a["lat"], a["lon"], b["lat"], b["lon"]))
    return along


def _window(along, i, window_m):
    """(start, end) index of the stretch used for point i: from i to the first point at least
    window_m further on. Near the end it is the last window_m of the route instead."""
    last = len(along) - 1
    end = next((k for k in range(i + 1, last + 1) if along[k] - along[i] >= window_m), None)
    if end is not None:
        return i, end
    start = max((k for k in range(i + 1) if along[last] - along[k] >= window_m), default=0)
    return start, last


def windowed_grades(along, elev, window_m=WINDOW_M):
    """Slope in degrees (uphill or downhill) at each point over a window of at least window_m."""
    grades = []
    for i in range(len(along)):
        a, b = _window(along, i, window_m)
        run = along[b] - along[a]
        grades.append(math.degrees(math.atan2(abs(elev[b] - elev[a]), run)) if run > 0 else 0.0)
    return grades
