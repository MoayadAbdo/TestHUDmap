// The land around the 3D height map, so zooming out in 3D shows Gale crater and beyond like the 2D map does.
// Flat photo layers (no heights outside the 1 m HiRISE map): CTX of Gale crater (~6 m) close, Viking colour far.
// Same Mars Trek tiles as the 2D map (basemap.js). Tiles are plate carrée, so a block of tiles is a plain rectangle.
const TREK = "https://trek.nasa.gov/tiles/Mars/EQ";
const RINGS = [
  { name: "Gale_CTX_BlockAdj_dd", ext: "png", z: 11, span: 6, drop: 3 },                  // ~31 km square
  { name: "Mars_Viking_MDIM21_ClrMosaic_global_232m", ext: "jpg", z: 6, span: 4, drop: 6 },  // ~660 km square
];
const TILE_PX = 256;

function tileImage(url) {
  return new Promise((ok) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = () => ok(null);                      // a missing tile leaves a dark square, not a broken map
    im.src = url;
  });
}

/** Which tiles cover `span` x `span` around [lat, lon] at zoom z, and the box they cover. */
export function tileBlock([lat, lon], z, span) {
  const deg = 180 / 2 ** z;
  const row0 = Math.floor((90 - lat) / deg - span / 2 + 0.5);
  const col0 = Math.floor((lon + 180) / deg - span / 2 + 0.5);
  return {
    row0, col0, deg,
    north: 90 - row0 * deg, south: 90 - (row0 + span) * deg,
    west: col0 * deg - 180, east: (col0 + span) * deg - 180,
  };
}

/** Adds the rings under the scene. toLocal(lat, lon) → { x, z } metres; groundY = height for the flat land. */
export async function addContext(THREE, scene, { center, toLocal, groundY }) {
  for (const ring of RINGS) {
    const b = tileBlock(center, ring.z, ring.span);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ring.span * TILE_PX;
    const g = canvas.getContext("2d");
    g.fillStyle = "#3a2a20";
    g.fillRect(0, 0, canvas.width, canvas.height);
    const jobs = [];
    for (let r = 0; r < ring.span; r++) {
      for (let c = 0; c < ring.span; c++) {
        const url = `${TREK}/${ring.name}/1.0.0/default/default028mm/${ring.z}/${b.row0 + r}/${b.col0 + c}.${ring.ext}`;
        jobs.push(tileImage(url).then((im) => im && g.drawImage(im, c * TILE_PX, r * TILE_PX)));
      }
    }
    await Promise.all(jobs);
    const nw = toLocal(b.north, b.west), se = toLocal(b.south, b.east);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(se.x - nw.x, se.z - nw.z).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    plane.position.set((nw.x + se.x) / 2, groundY - ring.drop, (nw.z + se.z) / 2);
    scene.add(plane);
  }
}
