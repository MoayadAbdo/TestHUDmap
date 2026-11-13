/**
 * The real height map as a grid you can ask questions of: slope and roughness per cell, and where cells are.
 * terrain = { heights, grid: [gw, gh], bounds, width_m, height_m } (mission/terrain, row 0 = north).
 */
export function createTerrainGrid(terrain) {
  const [gw, gh] = terrain.grid;
  const { north, south, west, east } = terrain.bounds;
  const cellX = terrain.width_m / (gw - 1);
  const cellY = terrain.height_m / (gh - 1);
  const slope = slopeGrid({ heights: terrain.heights, gw, gh, cellX, cellY });
  return {
    gw, gh, cellX, cellY, slope,
    rough: roughGrid(terrain.heights, gw, gh),
    cellOf([lat, lon]) {
      const i = Math.round(((lon - west) / (east - west)) * (gw - 1));
      const j = Math.round(((north - lat) / (north - south)) * (gh - 1));
      return i < 0 || j < 0 || i >= gw || j >= gh ? null : j * gw + i;
    },
    latLonOf: (k) => [north - (Math.floor(k / gw) / (gh - 1)) * (north - south), west + ((k % gw) / (gw - 1)) * (east - west)],
  };
}

/** Bumpiness: how far each cell sits above or below the plane through its neighbours (m). Ridges and blocks stand out. */
export function roughGrid(heights, gw, gh) {
  const rough = new Float32Array(gw * gh);
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const k = j * gw + i;
      const plane = (heights[k - 1] + heights[k + 1] + heights[k - gw] + heights[k + gw]) / 4;
      rough[k] = Math.abs(heights[k] - plane);
    }
  }
  return rough;
}

/** Slope in degrees for every cell of a height grid (row 0 = north). */
export function slopeGrid({ heights, gw, gh, cellX, cellY }) {
  const slope = new Float32Array(gw * gh);
  const h = (i, j) => heights[Math.max(0, Math.min(gh - 1, j)) * gw + Math.max(0, Math.min(gw - 1, i))];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * cellX);
      const dy = (h(i, j + 1) - h(i, j - 1)) / (2 * cellY);
      slope[j * gw + i] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
    }
  }
  return slope;
}
