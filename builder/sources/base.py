from typing import Protocol


class WaypointSource(Protocol):
    def get_waypoints(self, sol_min: int, sol_max: int) -> list[dict]:
        """Return [{'sol','lat','lon','elev','tilt','yaw','dist_total_m'}, ...] in drive order.
        tilt = rover tilt in degrees (not ground slope)."""
        ...


class WeatherSource(Protocol):
    def get_sol(self, sol: int) -> dict:
        """Return {'min_c','max_c','pressure_pa'} for one sol; a value is None when REMS has none."""
        ...
