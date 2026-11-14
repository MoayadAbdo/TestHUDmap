// sim.js — 3D VR simulation: walk on Mars at the Mount Sharp boxwork site.
//
// Real ground: NASA HiRISE satellite photo draped on heights from Curiosity's measurements.
// Walk where you look, reach glowing stop beacons, look at the highlighted rock to scan it.
//
// Page needs an import map for "three", e.g.
//   <script type="importmap">{ "imports": { "three": "../sim/vendor/three.module.min.js" } }</script>
//
// HUD usage:
//   import { sim } from "../sim/sim.js";
//   await sim.start(mission, { container: document.getElementById("world"), assetsBase: "../mission/", stereo: true });
//   await sim.enableSensors();                 // from a tap
//   sim.getPosition() -> { mars: [lat, lon], heading, pitch, stop, nextStop, dist_next_m, walking }
//   sim.on("arrive", ({ stop }) => ...)        // reached a stop beacon
//   sim.on("scan",   ({ stop }) => ...)        // finished scanning that stop's rock
//   sim.event("dust")                          // dust storm for 20 s
//   sim.setAutopilot(true)                     // walk by yourself along the route; just look around
//   sim.setWalking(true/false), sim.setStereo(true/false), sim.stop()
//
// Controls: hold the Bluetooth clicker (Space, Enter, ArrowUp, ArrowRight, PageDown, W) or gamepad A to walk.
// Laptop: hold Space to walk; drag the mouse (or A / D) to look around.

import * as THREE from "three";
import { createHeadPose } from "../hud/js/core/head-pose.js";
import { boulderSpots, rockSpots } from "./rock-spots.js";

const DEG = Math.PI / 180;
const EYE_H = 1.7;                 // astronaut eye height (m)
const ARRIVE_M = 6;                // reach a beacon within this distance
const SCAN_SECONDS = 2;            // look at the rock this long to scan it
const SCAN_RANGE_M = 20;           // the rock may sit a few metres below you on a slope
const WALK_KEYS = new Set([" ", "Enter", "ArrowUp", "ArrowRight", "PageDown", "w", "W"]);
const SKY_TOP = new THREE.Color("#b98a66"), SKY_LOW = new THREE.Color("#e9c8a3");
const FOG = new THREE.Color("#d8b48e"), DUST = new THREE.Color("#b8743f");
const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();   // afternoon sun, north-west

const S = {
  listeners: [], handlers: {}, raf: 0,
  heading: 0, pitch: 0, sensorHeading: null, sensorPitch: null,
  walking: false, keyWalking: false, pos: new THREE.Vector3(), bob: 0,
  visited: [], scanned: [], scanT: 0, dustUntil: 0, stereo: true,
  autopilot: false, rIdx: 1, pauseUntil: 0, lastManualLook: -1e9,
  move: { forward: 0, right: 0, turn: 0, run: false, boost: 0 }, yaw: 0,   // keyboard / gamepad / Ground Control steering
};
const TURN_DEG_PER_S = 90;
const RUN_FACTOR = 2.5;
const PAUSE_AT_STOP_MS = 8000;     // autopilot waits this long at each beacon (time to look and scan)

// ---------- helpers ----------
const wrap360 = (a) => ((a % 360) + 360) % 360;
const angleDiff = (a, b) => ((a - b + 540) % 360) - 180;
function listen(t, type, fn, o) { t.addEventListener(type, fn, o); S.listeners.push(() => t.removeEventListener(type, fn, o)); }
function emit(name, data) { (S.handlers[name] || []).forEach((f) => f(data)); }
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise3(x, y, z) {                       // smooth value noise
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t, H = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return L(L(L(H(0,0,0), H(1,0,0), u), L(H(0,1,0), H(1,1,0), u), v), L(L(H(0,0,1), H(1,0,1), u), L(H(0,1,1), H(1,1,1), u), v), w);
}
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

function makeLabel(text, color = "#7dfcff") {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.55)"; g.beginPath(); g.roundRect(4, 14, 504, 100, 30); g.fill();
  g.font = "bold 54px system-ui, sans-serif"; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 256, 66);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.24, 0.06, 1);
  sp.renderOrder = 10;
  return sp;
}

// tiling "gravel" texture, multiplied on top of the satellite photo for close-up detail
function makeDetailTexture() {
  const N = 512, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), r = rng(5);
  g.fillStyle = "rgb(150,150,150)"; g.fillRect(0, 0, N, N);
  const blob = (x, y, rx, ry, a, v) => {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {   // wrap so it tiles seamlessly
      g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, a, 0, Math.PI * 2);
      g.fillStyle = `rgba(${v},${v},${v},0.55)`; g.fill();
    }
  };
  for (let i = 0; i < 9000; i++) blob(r() * N, r() * N, 0.6 + r() * 1.6, 0.5 + r() * 1.2, r() * 3, 90 + r() * 130);
  for (let i = 0; i < 700; i++) blob(r() * N, r() * N, 2 + r() * 6, 1.5 + r() * 4, r() * 3, 70 + r() * 150);
  for (let i = 0; i < 60; i++) blob(r() * N, r() * N, 8 + r() * 22, 5 + r() * 14, r() * 3, 120 + r() * 60);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  // normal map from the same pattern (light = high)
  const src = g.getImageData(0, 0, N, N).data, nc = document.createElement("canvas"); nc.width = nc.height = N;
  const ng = nc.getContext("2d"), out = ng.createImageData(N, N);
  const hgt = (x, y) => src[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 2.5, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 2.5;
    const len = Math.hypot(dx, dy, 1), k = (y * N + x) * 4;
    out.data[k] = (-dx / len * 0.5 + 0.5) * 255; out.data[k + 1] = (dy / len * 0.5 + 0.5) * 255; out.data[k + 2] = (1 / len * 0.5 + 0.5) * 255; out.data[k + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const n = new THREE.CanvasTexture(nc);
  n.wrapS = n.wrapT = THREE.RepeatWrapping; n.colorSpace = THREE.NoColorSpace;
  t.normal = n;
  return t;
}

// ---------- world building ----------
async function loadTerrain(base) {
  const meta = await (await fetch(base + "terrain/terrain.json")).json();
  const buf = await (await fetch(base + "terrain/heights.bin")).arrayBuffer();
  const heights = new Float32Array(buf);
  const tex = await new THREE.TextureLoader().loadAsync(base + "terrain/ortho.jpg");
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const layers = await fetch(base + "layers/layers.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return { meta, heights, tex, layers: layers?.layers ?? [] };
}

// ---------- map layers on the ground (photo, slope, minerals, heat), from mission/layers/layers.json ----------
/** The ground texture with the danger zones painted on top (cached per base texture). */
function withOverlay(base) {
  if (!S.overlay || !base) return base;
  S.overlayTex ??= {};
  if (S.overlayTex[base.uuid]) return S.overlayTex[base.uuid];
  const img = base.image;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(S.overlay, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (S.overlayTex[base.uuid] = tex);
}
const LAYER_CYCLE = ["photo", "slope", "minerals_frt0000b6f1", "thermal"];
const PHOTO_TINT = "#f6bf92";
function layerList() {
  const sameBox = (b) => b && S.T && ["north", "south", "west", "east"].every((k) => Math.abs(b[k] - S.T.meta.bounds[k]) < 1e-6);
  return LAYER_CYCLE.map((id) => S.layerData.find((l) => l.id === id)).filter((l) => l && sameBox(l.bounds));
}
async function layerTexture(layer) {
  if (S.layerTex[layer.id]) return S.layerTex[layer.id];
  const img = new Image();
  img.src = S.opts.assetsBase + "layers/" + layer.file;
  await img.decode();
  const photo = S.photoTex.image;
  const c = document.createElement("canvas");
  c.width = photo.width; c.height = photo.height;
  const g = c.getContext("2d");
  g.filter = "grayscale(1) brightness(0.9)";
  g.drawImage(photo, 0, 0, c.width, c.height);          // the photo stays visible under the colours
  g.filter = "none";
  g.imageSmoothingEnabled = layer.resolution_m < 10;     // 18 m / 100 m pixels stay honest blocks
  g.globalCompositeOperation = layer.kind === "spectral" ? "screen" : "source-over";
  g.globalAlpha = layer.kind === "spectral" ? 0.95 : 0.62;
  g.drawImage(img, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (S.layerTex[layer.id] = tex);
}

function setupWorld(T) {
  const { meta, heights } = T;
  const [gw, gh] = meta.grid;
  const W = meta.width_m, H = meta.height_m;
  const [bx, bz] = meta.base_offset_m;
  S.T = { meta, heights, gw, gh, W, H, bx, bz };
  const mLat = meta.mars_radius_m * DEG, mLon = mLat * Math.cos(meta.base.lat * DEG);
  S.toLocal = (lat, lon) => new THREE.Vector3((lon - meta.base.lon) * mLon, 0, -(lat - meta.base.lat) * mLat);
  S.toLatLon = (x, z) => [meta.base.lat - z / mLat, meta.base.lon + x / mLon];

  // terrain mesh
  const geo = new THREE.PlaneGeometry(W, H, gw - 1, gh - 1);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heights[i]);
  geo.computeVertexNormals();
  const detail = makeDetailTexture();
  S.detail = detail;
  detail.normal.repeat.set(W / 2.5, H / 2.5);
  const mat = new THREE.MeshStandardMaterial({ map: T.tex, color: new THREE.Color("#f6bf92"), roughness: 0.96, metalness: 0,
    normalMap: detail.normal, normalScale: new THREE.Vector2(0.9, 0.9) });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.uniforms.detailRepeat = { value: new THREE.Vector2(W / 2.5, H / 2.5) };   // one tile every 2.5 m
    sh.fragmentShader = "uniform sampler2D detailMap; uniform vec2 detailRepeat;\n" + sh.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec3 d1 = texture2D(detailMap, vMapUv * detailRepeat).rgb;
       vec3 d2 = texture2D(detailMap, vMapUv * detailRepeat * 0.137 + 0.31).rgb;
       diffuseColor.rgb *= d1 * d2 * 2.9;`);
  };
  S.groundMat = mat; S.photoTex = T.tex; S.layerData = T.layers; S.layerTex = {}; S.layerId = "photo";
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  ground.position.set(-bx, 0, -bz);
  S.scene.add(ground);
  // flat ground beyond the photo, hidden in the haze
  const far = new THREE.Mesh(new THREE.CircleGeometry(4000, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: "#8a6446" }));
  far.position.y = meta.height_range_m[0] - 0.6;
  S.scene.add(far);
}

function heightAt(x, z) {
  const t = S.T;
  const u = (x + t.bx + t.W / 2) / t.W * (t.gw - 1), v = (z + t.bz + t.H / 2) / t.H * (t.gh - 1);
  const i = Math.max(0, Math.min(t.gw - 2, Math.floor(u))), j = Math.max(0, Math.min(t.gh - 2, Math.floor(v)));
  const fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j));
  const h = t.heights, k = j * t.gw + i;
  return (h[k] * (1 - fu) + h[k + 1] * fu) * (1 - fv) + (h[k + t.gw] * (1 - fu) + h[k + t.gw + 1] * fu) * fv;
}

function addSky() {
  const geo = new THREE.SphereGeometry(3000, 48, 24);
  const col = [], p = geo.attributes.position, v = new THREE.Vector3();
  const glowCol = new THREE.Color("#fff3df");
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const t = Math.max(0, Math.min(1, v.y * 2.2));
    const c = SKY_LOW.clone().lerp(SKY_TOP, t);
    const sun = Math.max(0, v.dot(SUN_DIR));
    c.lerp(glowCol, Math.pow(sun, 10) * 0.75 + Math.pow(sun, 3) * 0.12);   // bright halo around the sun
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  S.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  S.sky.renderOrder = -2;
  S.scene.add(S.sky);
  // sun disk (smaller and paler than on Earth)
  const sc = document.createElement("canvas"); sc.width = sc.height = 128;
  const sg = sc.getContext("2d"), grd = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,250,1)"); grd.addColorStop(0.18, "rgba(255,248,230,0.95)"); grd.addColorStop(1, "rgba(255,230,200,0)");
  sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
  S.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sc), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  S.sun.scale.set(180, 180, 1); S.sun.renderOrder = -1;
  S.scene.add(S.sun);
  // distant mountains: Mount Sharp rises to the south, Gale crater rim far to the north
  const N = 360, R = 2200, pos = [], idx = [], cols = [], r = rng(7);
  const noise = Array.from({ length: 20 }, () => r());
  const near = new THREE.Color("#b88a66"), far = new THREE.Color("#d7b08b");
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let h = 0;
    for (let k = 1; k <= 8; k++) h += Math.sin(a * k * 2 + noise[k] * 6) * (45 / k) + Math.sin(a * k * 7.3 + noise[k + 8] * 4) * (8 / k);
    const south = Math.max(0, -Math.cos(a));
    h = 60 + h + south * 420;
    const x = Math.sin(a) * R, z = -Math.cos(a) * R;
    pos.push(x, -50, z, x, h, z);
    const c = far.clone().lerp(near, south * 0.6);
    cols.push(c.r, c.g, c.b, c.r * 1.06, c.g * 1.06, c.b * 1.06);
    if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  mg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  mg.setIndex(idx);
  S.mountains = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  S.scene.add(S.mountains);
}

function rockGeometry(seed, flat = 0.6) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position, r = rng(seed), off = [r() * 50, r() * 50, r() * 50];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let d = 1;
    d += (noise3(v.x * 1.3 + off[0], v.y * 1.3 + off[1], v.z * 1.3 + off[2]) - 0.5) * 0.7;   // big lumps
    d += (noise3(v.x * 4 + off[1], v.y * 4 + off[2], v.z * 4 + off[0]) - 0.5) * 0.18;       // small bumps
    if (v.y < -0.3) d *= 0.9;                                                             // flatter bottom
    v.multiplyScalar(d); v.y *= flat;
    if (Math.abs(v.x) > 0.75) v.x = Math.sign(v.x) * (0.75 + (Math.abs(v.x) - 0.75) * 0.3);  // a few cut faces
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // smooth shading: average the normals of vertices that share a position
  const n = g.attributes.normal, key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  const sum = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = key(i), acc = sum.get(k) || [0, 0, 0];
    acc[0] += n.getX(i); acc[1] += n.getY(i); acc[2] += n.getZ(i); sum.set(k, acc);
  }
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = sum.get(key(i)), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}

function addRocks(route, boulders) {
  const r = rng(42);
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", map: S.detail, roughness: 0.92, metalness: 0 });
  const shapes = [rockGeometry(3, 0.6), rockGeometry(11, 0.45), rockGeometry(29, 0.3)];   // round, low, slab
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const tones = ["#8f6a50", "#7a5a45", "#a27d5f", "#6b4e3c", "#b08a6a"];
  const spots = [...boulderSpots(boulders, S.toLocal, { route }), ...rockSpots(S.T, { route, rand: r })];   // photo + height map
  shapes.forEach((geo, k) => {
    const mine = spots.filter((p) => p.shape === k);
    if (!mine.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach(({ x, z, size: s }, n) => {
      e.set((r() - 0.5) * 0.6, r() * 6.3, (r() - 0.5) * 0.6); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, heightAt(x, z) + s * 0.12, z), q, new THREE.Vector3(s * (0.8 + r() * 0.6), s, s * (0.8 + r() * 0.6)));
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, c.set(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.85 + r() * 0.3));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    S.scene.add(mesh);
  });
  // ambient dust drifting in the air
  const dn = 600, dpos = new Float32Array(dn * 3), dr = rng(17);
  for (let i = 0; i < dn * 3; i++) dpos[i] = (dr() - 0.5) * 40;
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  S.motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: "#f0d2b0", size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
  S.scene.add(S.motes);
}

function addStops(mission) {
  S.stops = mission.stops.map((st, i) => {
    const p = S.toLocal(st.mars[0], st.mars[1]);
    p.y = heightAt(p.x, p.z);
    const grp = new THREE.Group(); grp.position.copy(p);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#66fcf1", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 16, 1, true), beamMat); beam.position.y = 20; grp.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#66fcf1", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(ARRIVE_M - 0.4, ARRIVE_M, 64).rotateX(-Math.PI / 2), ringMat); ring.position.y = 0.15; grp.add(ring);
    const label = makeLabel(`${st.id} · ${st.name}`); label.position.y = 4; label.visible = !S.opts.hud; grp.add(label);
    S.scene.add(grp);
    // the science rock to scan, a few metres from the beacon
    const ang = i * 1.7 + 0.5, rx = p.x + Math.cos(ang) * 3.2, rz = p.z + Math.sin(ang) * 3.2;
    const rock = new THREE.Mesh(rockGeometry(100 + i), new THREE.MeshLambertMaterial({ color: "#a07a5c", emissive: "#000000" }));
    rock.scale.setScalar(0.9); rock.position.set(rx, heightAt(rx, rz) + 0.25, rz);   // big enough to find and look at
    const glow = new THREE.Mesh(rockGeometry(100 + i), new THREE.MeshBasicMaterial({ color: "#66fcf1", wireframe: true, transparent: true, opacity: 0.7 }));
    glow.scale.setScalar(1.15); rock.add(glow);
    S.scene.add(rock);
    return { st, pos: p, beamMat, ringMat, ring, rock, glow, label };
  });
  S.visited = S.stops.map((_, i) => i === 0);
  S.scanned = S.stops.map(() => false);
}

function addReticle() {
  const g = new THREE.Group(); g.position.set(0, 0, -2);
  const dot = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false, transparent: true, opacity: 0.8 }));
  dot.renderOrder = 20; g.add(dot);
  const progMat = new THREE.MeshBasicMaterial({ color: "#66fcf1", depthTest: false, side: THREE.DoubleSide });
  S.progress = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 48, 1, Math.PI / 2, 0.001), progMat);
  S.progress.renderOrder = 21; g.add(S.progress);
  S.camera.add(g);
}

function addDust() {
  const n = 1500, pos = new Float32Array(n * 3), r = rng(9);
  for (let i = 0; i < n * 3; i++) pos[i] = (r() - 0.5) * 60;
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  S.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: "#d39a66", size: 0.12, transparent: true, opacity: 0, depthWrite: false }));
  S.scene.add(S.dust);
}

// ---------- sensors & input ----------
// Head tracking from the phone's full 3D rotation: smooth when you look up and down (the iPhone compass value
// flips by 180° there, so it isn't used). The first reading faces where the view already looks.
function onOrientation(ev) {
  if (ev.alpha == null) return;
  S.head ??= createHeadPose({ startHeading: S.heading });
  S.head.update({ alpha: ev.alpha, beta: ev.beta, gamma: ev.gamma });
  if (S.head.heading != null) S.sensorHeading = S.head.heading;
  S.sensorPitch = S.head.pitch;
}
function addInput() {
  listen(window, "keydown", (e) => {
    if (S.opts.hud) return;               // HUD mode: the clicker talks to the AI, a tap walks
    if (WALK_KEYS.has(e.key)) { S.keyWalking = true; e.preventDefault(); }
    if (S.sensorHeading == null && (e.key === "a" || e.key === "A" || e.key === "ArrowLeft")) S.heading = wrap360(S.heading - 4);
    if (S.sensorHeading == null && (e.key === "d" || e.key === "D")) S.heading = wrap360(S.heading + 4);
  });
  listen(window, "keyup", (e) => { if (WALK_KEYS.has(e.key)) S.keyWalking = false; });
  let drag = null;
  listen(window, "pointerdown", (e) => { if (e.pointerType === "mouse") drag = [e.clientX, e.clientY]; });
  listen(window, "pointermove", (e) => {
    if (!drag || S.sensorHeading != null) return;
    S.heading = wrap360(S.heading - (e.clientX - drag[0]) * 0.25);
    S.lastManualLook = performance.now();
    S.pitch = Math.max(-60, Math.min(60, S.pitch + (e.clientY - drag[1]) * 0.2));
    drag = [e.clientX, e.clientY];
  });
  listen(window, "pointerup", () => { drag = null; });
  listen(window, "resize", resize);
}
function resize() {
  const el = S.container, w = el.clientWidth, h = el.clientHeight;
  S.renderer.setSize(w, h, false);
  S.camera.aspect = (S.stereo ? w / 2 : w) / h;
  // HUD mode: match the HUD's horizontal field of view so its pins sit on our beacons
  if (S.opts.hfovDeg) S.camera.fov = 2 * Math.atan(Math.tan(S.opts.hfovDeg * DEG / 2) / S.camera.aspect) / DEG;
  S.camera.updateProjectionMatrix();
}

// ---------- per frame ----------
function nextStopIndex() { const i = S.visited.indexOf(false); return i < 0 ? S.stops.length - 1 : i; }
function nearestRouteIndex() {
  let best = 0, bd = Infinity;
  S.routePts.forEach((p, i) => { const d = Math.hypot(p.x - S.pos.x, p.z - S.pos.z); if (d < bd) { bd = d; best = i; } });
  return Math.min(best + 1, S.routePts.length - 1);
}
// autopilot: follow Curiosity's route point by point; head straight for the beacon when it is close
function autopilotDirection(now) {
  if (!S.autopilot || now < S.pauseUntil || S.visited.every(Boolean)) return null;
  const beacon = S.stops[nextStopIndex()].pos;
  let target = S.routePts[S.rIdx];
  if (Math.hypot(target.x - S.pos.x, target.z - S.pos.z) < 1.5 && S.rIdx < S.routePts.length - 1) target = S.routePts[++S.rIdx];
  if (Math.hypot(beacon.x - S.pos.x, beacon.z - S.pos.z) < 15) target = beacon;
  return wrap360(Math.atan2(target.x - S.pos.x, -(target.z - S.pos.z)) / DEG);
}

function tick(now) {
  const dt = Math.min(0.25, (now - (S.last || now)) / 1000); S.last = now;   // slow phones still walk at real speed
  update(dt, now);
  render();
  S.raf = requestAnimationFrame(tick);
}

function update(dt, now) {
  const t = now / 1000;
  // look direction; turning (Q/E, arrows, right stick) adds to the head direction in VR
  const m = S.move;
  if (m.turn) {
    if (S.sensorHeading != null) S.yaw = wrap360(S.yaw + m.turn * TURN_DEG_PER_S * dt);
    else { S.heading = wrap360(S.heading + m.turn * TURN_DEG_PER_S * dt); S.lastManualLook = now; }
  }
  if (S.sensorHeading != null) {
    S.heading = wrap360(S.heading + angleDiff(wrap360(S.sensorHeading + S.yaw), S.heading) * Math.min(1, dt * 10));
    S.pitch += (S.sensorPitch - S.pitch) * Math.min(1, dt * 10);
  }
  // walking; steering (WASD, left stick, Ground Control) walks where you look, sideways or back too
  const stick = Math.min(1, Math.hypot(m.forward, m.right));
  const steering = stick > 0.1;
  if (steering && S.autopilot) S.autopilot = false;                  // the player takes over
  const pad = !S.opts.hud && navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;   // HUD reads the pad itself
  const manual = steering || S.walking || S.keyWalking || !!(pad && pad.buttons[0] && pad.buttons[0].pressed);
  // Mars walk mode: the HUD gives us the astronaut's real GPS position, already mapped onto Mars
  let extMoving = false;
  if (S.external) {
    const { target, heading, pitch } = S.external, k = Math.min(1, dt * 2.5);      // glide, so GPS jumps look smooth
    const ox = S.pos.x, oz = S.pos.z;
    S.pos.x += (target.x - S.pos.x) * k; S.pos.z += (target.z - S.pos.z) * k;
    const speed = Math.hypot(S.pos.x - ox, S.pos.z - oz) / Math.max(dt, 1e-3);
    extMoving = speed > 0.25;
    if (extMoving) S.bob += dt * speed * 6;
    if (heading != null) S.heading = wrap360(S.heading + angleDiff(heading, S.heading) * Math.min(1, dt * 8));
    if (pitch != null) S.pitch += (pitch - S.pitch) * Math.min(1, dt * 8);   // head up / down from the phone
  }
  const autoDir = manual || S.external ? null : autopilotDirection(now);
  const walking = !S.external && (manual || autoDir != null);
  // laptop without motion sensors: the view turns gently towards where you walk
  if (autoDir != null && S.sensorHeading == null && now - S.lastManualLook > 3000) {
    S.heading = wrap360(S.heading + angleDiff(autoDir, S.heading) * Math.min(1, dt * 1.5));
    S.pitch += (-8 - S.pitch) * Math.min(1, dt * 1.5);
  }
  S.moveHeading = steering ? wrap360(S.heading + Math.atan2(m.right, m.forward) / DEG) : autoDir ?? S.heading;
  if (walking) {
    const pace = steering ? stick * (m.run ? RUN_FACTOR : 1) : 1;
    const times = steering && m.boost ? m.boost : S.opts.speed;      // Ground Control's Drive speed wins while it steers
    const sp = (S.mission.suit?.walk_speed_mps || 0.8) * times * pace;
    const h = S.moveHeading * DEG;
    const nx = S.pos.x + Math.sin(h) * sp * dt, nz = S.pos.z - Math.cos(h) * sp * dt;
    const T = S.T, lim = (v, half, off) => Math.max(-half - off + 5, Math.min(half - off - 5, v));
    S.pos.x = lim(nx, T.W / 2, T.bx); S.pos.z = lim(nz, T.H / 2, T.bz);
    S.bob += dt * sp * 6;
  }
  S.pos.y = heightAt(S.pos.x, S.pos.z) + EYE_H + (walking || extMoving ? Math.sin(S.bob) * 0.03 : 0);
  S.camera.position.copy(S.pos);
  if (S.opts.lockPitch) S.pitch = 0;          // HUD mode: the HUD draws its horizon at mid-screen
  S.camera.rotation.set(S.pitch * DEG, -S.heading * DEG, 0, "YXZ");
  S.sky.position.set(S.pos.x, 0, S.pos.z);
  S.sun.position.copy(SUN_DIR).multiplyScalar(2500).add(S.pos);
  S.sunLight.position.copy(SUN_DIR).multiplyScalar(150).add(S.pos);      // shadows follow the astronaut
  S.sunLight.target.position.copy(S.pos);
  S.motes.position.set(S.pos.x + Math.sin(t * 0.13) * 3, S.pos.y - 1, S.pos.z + ((t * 0.6) % 40) - 20);
  S.mountains.position.set(S.pos.x, 0, S.pos.z);

  // stops: pulse, arrive
  const next = nextStopIndex();
  S.stops.forEach((s, i) => {
    const isNext = i === next && !S.visited[i];
    const col = S.visited[i] ? "#9aa3ad" : isNext ? "#66fcf1" : "#7c8aa0";
    s.beamMat.color.set(col); s.ringMat.color.set(col);
    // the light beam fades out when you stand next to it, so it doesn't fill the view (or cover the stop card)
    const near = Math.min(1, Math.max(0, (Math.hypot(S.pos.x - s.pos.x, S.pos.z - s.pos.z) - 4) / 20));
    s.beamMat.opacity = (isNext ? 0.3 + Math.sin(t * 3) * 0.15 : 0.18) * near;
    s.ring.scale.setScalar(isNext ? 1 + Math.sin(t * 3) * 0.04 : 1);
    s.ringMat.opacity = S.visited[i] ? 0.15 : 0.8;
    s.glow.material.opacity = S.scanned[i] ? 0 : 0.35 + Math.sin(t * 4) * 0.25;
    if (!S.visited[i] && i === next && Math.hypot(S.pos.x - s.pos.x, S.pos.z - s.pos.z) < ARRIVE_M) {
      S.visited[i] = true;
      if (S.autopilot) S.pauseUntil = now + PAUSE_AT_STOP_MS;
      emit("arrive", { stop: i, name: s.st.name });
    }
  });

  // gaze scanning
  S.ray.setFromCamera(new THREE.Vector2(0, 0), S.camera);
  const targets = S.stops.filter((s, i) => !S.scanned[i]).map((s) => s.rock);
  const hit = S.ray.intersectObjects(targets, false)[0];
  S.scanIndex = -1;
  if (hit && hit.distance < SCAN_RANGE_M) {
    S.scanT += dt;
    const i = S.stops.findIndex((s) => s.rock === hit.object);
    S.scanIndex = i;
    if (S.scanT >= SCAN_SECONDS) {
      S.scanned[i] = true; S.scanT = 0;
      S.stops[i].rock.material.emissive.set("#1d5a57");
      emit("scan", { stop: i, name: S.stops[i].st.name });
    }
  } else S.scanT = Math.max(0, S.scanT - dt * 2);
  S.progress.geometry.dispose();
  S.progress.geometry = new THREE.RingGeometry(0.03, 0.045, 48, 1, Math.PI / 2, Math.max(0.001, (S.scanT / SCAN_SECONDS) * Math.PI * 2));


  // dust storm
  const dusty = now < S.dustUntil ? 1 : 0;
  S.dustLevel = (S.dustLevel || 0) + (dusty - (S.dustLevel || 0)) * Math.min(1, dt * 0.8);
  const d = S.dustLevel;
  S.scene.fog.color.copy(FOG).lerp(DUST, d);
  S.scene.fog.near = 40 * (1 - d) + 2 * d; S.scene.fog.far = 500 * (1 - d) + 35 * d;
  S.sky.material.color.setScalar(1 - d * 0.5);
  S.dust.material.opacity = d * 0.8;
  S.dust.position.set(S.pos.x + Math.sin(t) * 2, S.pos.y, S.pos.z + t * 1.5 % 30);
}

function render() {
  const r = S.renderer, w = S.container.clientWidth, h = S.container.clientHeight;
  if (!S.stereo) { r.setScissorTest(false); r.setViewport(0, 0, w, h); r.render(S.scene, S.camera); return; }
  S.camera.updateMatrixWorld();
  S.stereoCam.update(S.camera);
  r.setScissorTest(true);
  r.setScissor(0, 0, w / 2, h); r.setViewport(0, 0, w / 2, h); r.render(S.scene, S.stereoCam.cameraL);
  r.setScissor(w / 2, 0, w / 2, h); r.setViewport(w / 2, 0, w / 2, h); r.render(S.scene, S.stereoCam.cameraR);
  r.setScissorTest(false);
}

// ---------- public API ----------
export const sim = {
  async start(mission, opts = {}) {
    this.stop();
    S.mission = mission;
    S.head = null; S.sensorHeading = null; S.yaw = 0;   // head tracking starts fresh
    S.opts = { assetsBase: "../mission/", speed: 1, stereo: true, ...opts };
    S.stereo = S.opts.stereo;
    S.container = S.opts.container || document.body;
    S.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });  // HUD copies the picture
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    S.renderer.toneMappingExposure = 1.05;
    S.renderer.shadowMap.enabled = true;
    S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    S.container.appendChild(S.renderer.domElement);
    S.scene = new THREE.Scene();
    S.scene.fog = new THREE.Fog(FOG.clone(), 40, 500);
    S.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 6000);
    S.scene.add(S.camera);
    S.stereoCam = new THREE.StereoCamera(); S.stereoCam.eyeSep = 0.064;
    S.ray = new THREE.Raycaster();
    S.scene.add(new THREE.HemisphereLight("#f3d9bd", "#6a4a35", 1.5));
    const sun = new THREE.DirectionalLight("#fff1dc", 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 400 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
    S.scene.add(sun, sun.target);
    S.sunLight = sun;

    const T = await loadTerrain(S.opts.assetsBase);
    setupWorld(T);
    addSky();
    const route = mission.route.map((p) => S.toLocal(p.lat ?? p[0], p.lon ?? p[1]));
    S.routePts = route;
    const boulders = await fetch(S.opts.assetsBase + "terrain/boulders.json").then((x) => (x.ok ? x.json() : null)).catch(() => null);
    addRocks(route, boulders?.boulders);
    addStops(mission);
    addReticle();
    addDust();

    // start at the base, facing the first stop
    S.pos.copy(S.stops[0].pos);
    const f = S.stops[1].pos;
    S.heading = wrap360(Math.atan2(f.x - S.pos.x, -(f.z - S.pos.z)) / DEG);
    S.rIdx = nearestRouteIndex();
    S.autopilot = !!S.opts.autopilot;
    resize();
    addInput();
    S.raf = requestAnimationFrame(tick);
  },

  async enableSensors() {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission();
    } catch (_) { /* keep mouse / keys */ }
    if ("ondeviceorientationabsolute" in window) listen(window, "deviceorientationabsolute", onOrientation);
    else listen(window, "deviceorientation", onOrientation);
  },

  getPosition() {
    const next = nextStopIndex(), s = S.stops[next];
    const last = S.visited.lastIndexOf(true);
    const mars = S.toLatLon(S.pos.x, S.pos.z);
    return {
      mars, lat: mars[0], lon: mars[1],
      heading: S.heading, pitch: S.pitch,
      stop: last, nextStop: next,
      dist_next_m: Math.hypot(S.pos.x - s.pos.x, S.pos.z - s.pos.z),
      visited: [...S.visited], scanned: [...S.scanned],
      walking: S.walking || S.keyWalking,
    };
  },

  on(name, fn) { (S.handlers[name] ||= []).push(fn); },
  /** The 3D picture (a canvas) for the HUD to draw behind its overlay. */
  getBackground() { return S.renderer?.domElement ?? null; },
  /** Demo panel: jump next to a stop. */
  jumpToStop(i) { this.teleport(Math.max(0, Math.min(S.stops.length - 1, i))); },
  event(type) { if (type === "dust") S.dustUntil = performance.now() + 20000; if (type === "clear") S.dustUntil = 0; },
  setWalking(on) { S.walking = !!on; },
  /** Mars walk mode: put the astronaut at this Mars position (from real GPS), looking at `heading`. */
  setExternalPosition(mars, heading = null, pitch = null) {
    if (!S.toLocal || !mars) return;
    S.autopilot = false;
    const target = S.toLocal(mars[0], mars[1]);
    if (!S.external) S.pos.set(target.x, S.pos.y, target.z);     // first fix: jump there
    S.external = { target, heading, pitch };
  },
  /** Walk by yourself along the route, pausing at each beacon. You only look around. */
  setAutopilot(on) { S.autopilot = !!on; S.pauseUntil = 0; if (on) S.rIdx = nearestRouteIndex(); },
  isAutopilot() { return S.autopilot; },
  /** Map layers that can be painted on the ground: [{ id, name, instrument, mission, resolution_m, legend, credit }]. */
  layerList() { return layerList(); },
  /** Paint a layer on the ground ("photo" = normal view). Returns the layer, or null if unknown. */
  async setLayer(id) {
    const layer = layerList().find((l) => l.id === id);
    if (!layer || !S.groundMat) return null;
    S.baseMap = layer.id === "photo" ? S.photoTex : await layerTexture(layer);
    S.groundMat.map = withOverlay(S.baseMap);
    S.groundMat.color.set(layer.id === "photo" ? PHOTO_TINT : "#ffffff");
    S.groundMat.needsUpdate = true;
    S.layerId = layer.id;
    return layer;
  },
  /** Danger zones (a canvas over the same box as the ground, clear where safe) drawn on top of any layer; null = off. */
  setGroundOverlay(canvas) {
    S.overlay = canvas ?? null;
    S.overlayTex = {};
    if (S.groundMat) { S.groundMat.map = withOverlay(S.baseMap ?? S.photoTex); S.groundMat.needsUpdate = true; }
  },
  /** Science rocks to scan (look at one for 2 s): [{ index, mars: [lat, lon], scanned }] — index as in mission.stops. */
  scanTargets() {
    return (S.stops ?? []).map((s, index) => ({ index, mars: S.toLatLon(s.rock.position.x, s.rock.position.z), scanned: S.scanned[index] }));
  },
  /**
   * Where a spot `forward` / `right` metres from the astronaut (along where they face) appears in the view, `lift`
   * metres above the real ground: { x, y } in 0..1 and scale (view heights per metre), or null if behind / off.
   * Exact, from the 3D camera, so HUD arrows and pins stay on the ground on slopes and when looking up or down.
   */
  projectRelative(forward, right, lift = 0) {
    if (!S.camera || !S.T) return null;
    const h = S.heading * DEG;
    const x = S.pos.x + Math.sin(h) * forward + Math.cos(h) * right;
    const z = S.pos.z - Math.cos(h) * forward + Math.sin(h) * right;
    S.camera.updateMatrixWorld();
    const p = new THREE.Vector3(x, heightAt(x, z) + lift, z);
    const dist = p.distanceTo(S.camera.position);
    const v = p.project(S.camera);
    if (v.z > 1 || v.z < -1) return null;
    const fovY = S.camera.fov * DEG;
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, scale: 1 / (2 * Math.tan(fovY / 2) * Math.max(0.5, dist)) };
  },
  /** Where stop index's science rock is in the view right now: { x, y } in 0..1 of the view, size (0..1 of height),
   *  or null when it's behind you. Exact, from the 3D camera (the HUD's own maths drifts on slopes). */
  rockOnScreen(index) {
    const s = S.stops?.[index];
    if (!s || !S.camera) return null;
    S.camera.updateMatrixWorld();
    const c = s.rock.position.clone();
    const top = c.clone(); top.y += 0.9;
    const pc = c.project(S.camera), pt = top.project(S.camera);
    if (pc.z > 1 || pc.z < -1) return null;
    return { x: (pc.x + 1) / 2, y: (1 - pc.y) / 2, size: Math.abs(pt.y - pc.y) / 2 };
  },
  /** Scanning now: { index, progress 0..1 } or null. */
  scanProgress() {
    return S.scanIndex >= 0 && S.scanT > 0 ? { index: S.scanIndex, progress: Math.min(1, S.scanT / SCAN_SECONDS) } : null;
  },
  /** The height grid the 3D ground is built from ({ ...terrain.json, heights }), so the HUD needn't download it again. */
  terrain() { return S.T ? { ...S.T.meta, heights: S.T.heights } : null; },
  /** How far below the eye the ground is at this Mars point (metres), so HUD arrows sit on the real ground. */
  eyeDrop(lat, lon) {
    if (!S.toLocal || !S.T) return null;
    const v = S.toLocal(lat, lon);
    return S.pos.y - heightAt(v.x, v.z);
  },
  /** Steer without walking for real: forward / right in -1..1 (back / left when negative), turn in -1..1, run,
   *  boost = speed × while steering (0 = the sim's own speed). */
  setMoveInput({ forward = 0, right = 0, turn = 0, run = false, boost = 0 } = {}) {
    const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
    const times = Number(boost) > 0 ? Math.min(10, Number(boost)) : 0;
    S.move = { forward: clamp(forward), right: clamp(right), turn: clamp(turn), run: !!run, boost: times };
  },
  setStereo(on) { S.stereo = !!on; if (S.renderer) resize(); },
  /** Jump next to a stop (testing). */
  teleport(i) {
    const p = S.stops[i].pos; S.pos.set(p.x - 8, 0, p.z + 8);
    S.stops.forEach((_, k) => { S.visited[k] = k < i; });
    S.rIdx = nearestRouteIndex();
  },
  /** Fast-forward the simulation by `seconds` (testing). */
  fastForward(seconds, step = 0.05) {
    S.clock = S.clock ?? performance.now();
    for (let k = 0; k < seconds / step; k++) { S.clock += step * 1000; update(step, S.clock); }
    S.pauseUntil = Math.min(S.pauseUntil, performance.now());
  },
  /** Look at a compass heading / pitch (testing, laptop). */
  look(heading, pitch = 0) { S.heading = wrap360(heading); S.pitch = pitch; },
  stop() {
    cancelAnimationFrame(S.raf);
    S.listeners.forEach((off) => off()); S.listeners = [];
    if (S.renderer) { S.renderer.dispose(); S.renderer.domElement.remove(); S.renderer = null; }
  },
};
