// The Mars under the map, from far to close, so zooming out keeps showing real ground (all via JPL Mars Trek):
// Viking colour mosaic of the whole planet (232 m) → CTX mosaic of Gale crater (~6 m) → HiRISE along the route (0.63 m).
const TREK = "https://trek.nasa.gov/tiles/Mars/EQ";
const PATH = "1.0.0/default/default028mm/{z}/{y}/{x}";

export function addBasemap(L, map, hiriseUrl) {
  L.tileLayer(`${TREK}/Mars_Viking_MDIM21_ClrMosaic_global_232m/${PATH}.jpg`, {
    maxNativeZoom: 7, maxZoom: 18, attribution: "NASA/JPL/USGS Viking MDIM 2.1",
  }).addTo(map);
  L.tileLayer(`${TREK}/Gale_CTX_BlockAdj_dd/${PATH}.png`, {
    minNativeZoom: 5, maxNativeZoom: 12, maxZoom: 18, bounds: [[-7, 135], [-3, 140]], attribution: "NASA/JPL/MSSS CTX",
  }).addTo(map);
  L.tileLayer(hiriseUrl, { maxNativeZoom: 16, maxZoom: 18, attribution: "NASA/JPL/UArizona HiRISE · Mars Trek" }).addTo(map);
}
