"""Curiosity raw-image API, one sol at a time (all pages)."""

API_PAGE = ("https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=50&page={page}"
            "&condition_1=msl:mission&condition_2={sol}:sol:gte&condition_3={sol}:sol:lte")
NAVCAM_LEFT = "NAV_LEFT_B"
MAX_PAGES = 60


def is_full_frame(item, instrument):
    return item.get("instrument") == instrument and (item.get("extended") or {}).get("sample_type") == "full"


class RawImageClient:
    def __init__(self, get_json, max_pages=MAX_PAGES):
        self._get_json = get_json          # get_json(url) -> parsed JSON
        self._max_pages = max_pages

    def items(self, sol):
        """Every image item of one sol, sorted by image id (the API order is not stable)."""
        found = []
        for page in range(self._max_pages):
            data = self._get_json(API_PAGE.format(sol=sol, page=page))
            batch = data.get("items") or []
            found += batch
            if not batch or not data.get("more"):
                break
        return sorted(found, key=lambda x: x.get("imageid") or "")

    def full_frames(self, sol, instrument=NAVCAM_LEFT):
        return [x for x in self.items(sol) if is_full_frame(x, instrument)]
