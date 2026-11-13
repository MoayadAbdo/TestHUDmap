"""The walk's stops, kept in one place: stops.json."""
import json

import paths


def load_stops(path=paths.STOPS_FILE):
    with open(path) as fh:
        return json.load(fh)


def base_stop(stops):
    return next(s for s in stops if s.get("is_base"))


def walk_sols(stops):
    """First and last sol of the walk (the route covers Curiosity's drives in between)."""
    sols = [s["sol"] for s in stops]
    return min(sols), max(sols)
