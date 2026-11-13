"""Curiosity REMS weather per sol, from NASA's weather feed."""

REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"


def _number(value):
    return None if value in (None, "", "--") else float(value)


class RemsWeatherSource:
    def __init__(self, cache):
        self._cache = cache                # anything with .json(url, name), e.g. download.DownloadCache
        self._by_sol = None

    def get_sol(self, sol):
        if self._by_sol is None:
            soles = self._cache.json(REMS_URL, "rems_weather.json")["soles"]
            self._by_sol = {int(s["sol"]): s for s in soles}
        r = self._by_sol.get(int(sol), {})
        return {"min_c": _number(r.get("min_temp")), "max_c": _number(r.get("max_temp")),
                "pressure_pa": _number(r.get("pressure"))}
