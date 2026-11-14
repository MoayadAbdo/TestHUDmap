// Ground Control's map in 3D: the real 1 m HiRISE height map with the HiRISE photo (or the chosen layer) on top,
// Curiosity's route, the numbered stops and the astronaut live. Drag to orbit, scroll / pinch to zoom.
// Same terrain files and the same 3D engine as the phone's sim (mission/terrain, sim/vendor/three).
import * as THREE from "three";
import { addContext, sideWalls } from "./map3d-context.js";

const DEG = Math.PI / 180;
const LIFT = 1.2;                 // route and markers float a little above the ground so they never sink into it

export async function createMap3d({ container, base = "../mission/", mission, exaggerate = 1.5 }) {
  const meta = await (await fetch(base + "terrain/terrain.json")).json();
  const heights = new Float32Array(await (await fetch(base + "terrain/heights.bin")).arrayBuffer());
  const [gw, gh] = meta.grid;
  const W = meta.width_m, H = meta.height_m;
  const [bx, bz] = meta.base_offset_m;
  const mLat = meta.mars_radius_m * DEG, mLon = mLat * Math.cos(meta.base.lat * DEG);
  const toLocal = (lat, lon) => ({ x: (lon - meta.base.lon) * mLon, z: -(lat - meta.base.lat) * mLat });
  function heightAt(x, z) {                         // bilinear, like the sim
    const u = ((x + bx + W / 2) / W) * (gw - 1), v = ((z + bz + H / 2) / H) * (gh - 1);
    const i = Math.max(0, Math.min(gw - 2, Math.floor(u))), j = Math.max(0, Math.min(gh - 2, Math.floor(v)));
    const fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j)), k = j * gw + i;
    return ((heights[k] * (1 - fu) + heights[k + 1] * fu) * (1 - fv) + (heights[k + gw] * (1 - fu) + heights[k + gw + 1] * fu) * fv) * exaggerate;
  }
  const at = ([lat, lon], lift = LIFT) => { const p = toLocal(lat, lon); return new THREE.Vector3(p.x, heightAt(p.x, p.z) + lift, p.z); };

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })   // 1 m detail and 600 km land in one view;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:12px";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#14100c");
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2e6);
  scene.add(new THREE.HemisphereLight("#fff3e2", "#3a2a1e", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 1.8);
  sun.position.set(-500, 700, -400);
  scene.add(sun);

  // ground
  const geo = new THREE.PlaneGeometry(W, H, gw - 1, gh - 1).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i] * exaggerate);
  geo.computeVertexNormals();
  const loader = new THREE.TextureLoader();
  const photo = await loader.loadAsync(base + "terrain/ortho.jpg");
  photo.colorSpace = THREE.SRGBColorSpace;
  photo.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: photo, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(geo, mat);
  ground.position.set(-bx, 0, -bz);
  scene.add(ground);

  // the land around it (flat photos), just under the lowest point of the height map so it never covers the route;
  // the height map stands on it like a terrain model, with side walls down to it
  let low = Infinity;
  for (const h of heights) low = Math.min(low, h);
  const groundY = low * exaggerate - 2;
  scene.add(sideWalls(THREE, { heights, gw, gh, W, H, exaggerate, floorY: groundY, at: [-bx, -bz] }));
  addContext(THREE, scene, { center: [meta.base.lat, meta.base.lon], toLocal, groundY }).catch(() => {});

  // route + stops
  const routePts = mission.route.map((p) => at(p.mars ?? [p.lat, p.lon], 0.8));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(routePts), new THREE.LineBasicMaterial({ color: "#ffb54a" })));
  const stopLabels = [];
  for (const s of mission.stops) {
    const p = at(s.mars, 0);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 14, 10), new THREE.MeshBasicMaterial({ color: s.is_base ? "#4ade80" : "#ffffff" }));
    pin.position.copy(p).add(new THREE.Vector3(0, 7, 0));
    scene.add(pin);
    stopLabels.push({ s, p: p.clone().add(new THREE.Vector3(0, 16, 0)) });
  }
  const labelLayer = document.createElement("div");
  labelLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
  container.appendChild(labelLayer);
  const labelEls = stopLabels.map(({ s }) => {
    const el = document.createElement("div");
    el.className = `stop-pin${s.is_base ? " base" : ""}`;
    el.style.cssText = "position:absolute;transform:translate(-50%,-50%)";
    el.textContent = s.is_base ? "B" : s.id;
    el.title = s.name;
    labelLayer.append(el);
    return el;
  });

  // astronaut + trail
  const astro = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: "#22d3ee" }));
  astro.visible = false;
  scene.add(astro);
  const trailPts = [];
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#22d3ee" }));
  scene.add(trail);

  // orbit camera around the route's middle
  const mid = routePts[Math.floor(routePts.length / 2)].clone();
  const view = { target: mid, dist: 520, yaw: -30, pitch: 42 };
  function place() {
    const p = Math.max(12, Math.min(85, view.pitch)) * DEG, y = view.yaw * DEG;
    camera.position.set(view.target.x + view.dist * Math.cos(p) * Math.sin(y), view.target.y + view.dist * Math.sin(p), view.target.z + view.dist * Math.cos(p) * Math.cos(y));
    camera.lookAt(view.target);
  }
  let drag = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {                                  // shift-drag / right-drag: slide the view
      const k = view.dist / 600, y = view.yaw * DEG;
      view.target.x -= (dx * Math.cos(y) + dy * Math.sin(y)) * k;
      view.target.z -= (-dx * Math.sin(y) + dy * Math.cos(y)) * k;
    } else { view.yaw -= dx * 0.3; view.pitch += dy * 0.25; }
  });
  addEventListener("pointerup", () => { drag = null; });
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("wheel", (e) => { e.preventDefault(); view.dist = Math.max(80, Math.min(400000, view.dist * (1 + Math.sign(e.deltaY) * 0.12))); }, { passive: false });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const v = new THREE.Vector3();
  let running = false;
  function frame() {
    if (!running) return;
    resize();
    place();
    renderer.render(scene, camera);
    const w = container.clientWidth, h = container.clientHeight;
    stopLabels.forEach(({ p }, i) => {
      v.copy(p).project(camera);
      const show = v.z < 1;
      labelEls[i].style.display = show ? "" : "none";
      if (show) { labelEls[i].style.left = `${((v.x + 1) / 2) * w}px`; labelEls[i].style.top = `${((1 - v.y) / 2) * h}px`; }
    });
    requestAnimationFrame(frame);
  }

  const layerTex = new Map();
  return {
    /** Start / stop drawing (only while the 3D view is shown). */
    show(on) {
      container.style.display = on ? "" : "none";
      if (on && !running) { running = true; requestAnimationFrame(frame); }
      if (!on) running = false;
    },
    /** The astronaut's position on Mars ([lat, lon]) from telemetry. */
    setAstronaut(mars) {
      if (!mars) return;
      astro.position.copy(at(mars, 3));
      astro.visible = true;
      const last = trailPts[trailPts.length - 1];
      if (!last || last.distanceTo(astro.position) > 1) {
        trailPts.push(astro.position.clone());
        trail.geometry.dispose();
        trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPts);
      }
    },
    /** Drape a map layer (image URL over the same box) on the ground; null = the photo. */
    async setLayer(url) {
      if (!url) { mat.map = photo; mat.needsUpdate = true; return; }
      if (!layerTex.has(url)) {
        const img = await new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = url; });
        const c = document.createElement("canvas");
        c.width = photo.image.width; c.height = photo.image.height;
        const g = c.getContext("2d");
        g.filter = "grayscale(1) brightness(0.85)";
        g.drawImage(photo.image, 0, 0, c.width, c.height);
        g.filter = "none";
        g.globalAlpha = 0.7;
        g.drawImage(img, 0, 0, c.width, c.height);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        layerTex.set(url, t);
      }
      mat.map = layerTex.get(url);
      mat.needsUpdate = true;
    },
  };
}
