import { zonePixels } from './core/hazards.js';

/**
 * Zones from several layers, on the same grid as the height map: slope + rough ground (1 m DEM), looser ground
 * (lowest THEMIS thermal inertia here) and the strongest CRISM sulfate signal (science spots, not dangers).
 * Browser only (reads the layer images through a canvas).
 */
export const ZONES_KEY = {
  id: 'zones', name: 'Zones', instrument: 'HiRISE DEM · THEMIS · CRISM', resolution_m: 1, showAll: true,
  legend: [
    { color: '#ff4040', label: 'no-go slope (over 20°)' },
    { color: '#ffbe3c', label: 'careful (12–20°)' },
    { color: '#ffecaa', label: 'rough ground' },
    { color: '#5aa0ff', label: 'looser ground (THEMIS)' },
    { color: '#d36bff', label: 'sulfates (CRISM)' },
  ],
};

/** fetch / image loads can fail while the 3D sim is loading at the same moment: try a few times. */
async function retry(load, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await load(); } catch (error) {
      if (i >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * i));
    }
  }
}

async function pixelsOf(url, gw, gh, smooth) {
  const img = await retry(async () => { const im = new Image(); im.src = url; await im.decode(); return im; });
  const c = document.createElement('canvas');
  c.width = gw; c.height = gh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = smooth;
  g.drawImage(img, 0, 0, gw, gh);
  return g.getImageData(0, 0, gw, gh).data;
}

/** Per cell: 1 where THEMIS shows the loosest ground (the lowest step of its colour key). */
export function looserCells(px, legend) {
  const steps = legend.map((l) => ({ v: Number(l.label), rgb: [1, 3, 5].map((i) => parseInt(l.color.slice(i, i + 2), 16)) }))
    .filter((s) => Number.isFinite(s.v)).sort((a, b) => a.v - b.v);
  const out = new Uint8Array(px.length / 4);
  for (let k = 0; k < out.length; k++) {
    if (px[k * 4 + 3] < 10) continue;
    let best = steps[0];
    let bestD = Infinity;
    for (const s of steps) {
      const d = (px[k * 4] - s.rgb[0]) ** 2 + (px[k * 4 + 1] - s.rgb[1]) ** 2 + (px[k * 4 + 2] - s.rgb[2]) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
    out[k] = best === steps[0] ? 1 : 0;
  }
  return out;
}

/** Per cell: 1 where the CRISM browse is among its brightest 5% (strongest sulfate signal in this scene). */
export function sulfateCells(px, share = 0.05) {
  const n = px.length / 4;
  const bright = new Float32Array(n);
  const seen = [];
  for (let k = 0; k < n; k++) {
    if (px[k * 4 + 3] < 10) { bright[k] = -1; continue; }
    bright[k] = px[k * 4] + px[k * 4 + 1] + px[k * 4 + 2];
    seen.push(bright[k]);
  }
  seen.sort((a, b) => a - b);
  const bar = seen[Math.floor(seen.length * (1 - share))] ?? Infinity;
  return Uint8Array.from(bright, (b) => (b >= bar ? 1 : 0));
}

/** A canvas of the zones (gw × gh, clear where nothing to say) for the 3D ground and the Ground Control map. */
export async function zonesCanvas(grid, layersUrl) {
  const extras = { looser: null, sulfate: null };
  try {
    const { layers } = await retry(async () => (await fetch(layersUrl)).json());
    const base = new URL('./', new URL(layersUrl, location.href)).href;
    const heat = layers.find((l) => l.id === 'thermal');
    const minerals = layers.find((l) => l.id === 'minerals_frt0000b6f1') ?? layers.find((l) => l.kind === 'spectral');
    if (heat) extras.looser = looserCells(await pixelsOf(base + heat.file, grid.gw, grid.gh, false), heat.legend ?? []);
    if (minerals) extras.sulfate = sulfateCells(await pixelsOf(base + minerals.file, grid.gw, grid.gh, false));
  } catch (error) {
    console.warn('[zones] layers not loaded, showing slope and rough ground only:', error?.message ?? error);
  }
  const c = document.createElement('canvas');
  c.width = grid.gw; c.height = grid.gh;
  c.getContext('2d').putImageData(new ImageData(zonePixels(grid, extras), grid.gw, grid.gh), 0, 0);
  return c;
}
