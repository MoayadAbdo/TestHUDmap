// Map layers from mission/layers/layers.json on the Ground Control map: slope, minerals (3 CRISM scenes), heat,
// wider CTX context; a colour key with the credit, and "Show on visor" to paint the same layer on the
// astronaut's 3D ground. Stops get their slope and thermal inertia in the hover label.
import { createTerrainGrid } from "../hud/js/core/terrain-grid.js";
import { ZONES_KEY, zonesCanvas } from "../hud/js/zone-layers.js";

const VISOR_IDS = new Set(["photo", "slope", "minerals_frt0000b6f1", "thermal"]);   // the layers the 3D sim can paint

// One layer at a time, picked from a short button bar: Photo | Slope | Minerals | Heat | Context.
// Minerals has three CRISM scenes; the key offers a choice between them.
const GROUPS = [
  { name: "Photo", ids: [] },
  { name: "Zones", ids: ["zones"] },
  { name: "Slope", ids: ["slope"] },
  { name: "Minerals", ids: ["minerals_frt0000b6f1", "minerals", "minerals_hrl0000baba"] },
  { name: "Heat", ids: ["thermal"] },
  { name: "Context", ids: ["ctx"] },
];

export async function addMapLayers({ map, L, base = "../mission/layers/", onShowOnVisor }) {
  const data = await fetch(base + "layers.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!data) return null;
  const byId = new Map(data.layers.map((l) => [l.id, l]));
  const zones = await zonesLayer(base, byId.get("photo")?.bounds);    // slope + rough + THEMIS + CRISM, same as the visor
  if (zones) byId.set("zones", zones);
  const box = (b) => [[b.south, b.west], [b.north, b.east]];
  const overlays = new Map();
  const overlayOf = (l) => {
    if (!overlays.has(l.id)) {
      overlays.set(l.id, L.imageOverlay(l.url ?? base + l.file, box(l.bounds), {
        opacity: l.kind === "optical" ? 1 : 0.65, attribution: l.credit, className: l.resolution_m >= 10 ? "pixelated" : "",
      }));
    }
    return overlays.get(l.id);
  };
  const groups = GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => byId.has(id)) })).filter((g) => g.name === "Photo" || g.ids.length);
  let shown = null;

  const bar = L.control({ position: "topright" });
  bar.onAdd = () => L.DomUtil.create("div", "layer-bar");
  bar.addTo(map);
  const barEl = bar.getContainer();
  L.DomEvent.disableClickPropagation(barEl);
  const buttons = groups.map((g) => {
    const b = document.createElement("button");
    b.textContent = g.name;
    b.addEventListener("click", () => show(g.ids[0] ?? null));
    barEl.append(b);
    return { b, g };
  });

  const key = L.control({ position: "bottomleft" });
  key.onAdd = () => L.DomUtil.create("div", "layer-key");
  key.addTo(map);
  const keyEl = key.getContainer();
  L.DomEvent.disableClickPropagation(keyEl);

  function show(id) {
    if (shown) map.removeLayer(overlayOf(byId.get(shown)));
    shown = id;
    const l = id ? byId.get(id) : null;
    if (l) overlayOf(l).addTo(map);
    buttons.forEach(({ b, g }) => b.classList.toggle("on", id ? g.ids.includes(id) : g.name === "Photo"));
    drawKey(l ?? byId.get("photo"));
  }

  function drawKey(l) {
    keyEl.replaceChildren();
    keyEl.hidden = !l;
    if (!l) return;
    const group = groups.find((g) => g.ids.includes(l.id)) ?? { name: "Photo", ids: [] };
    const title = document.createElement("b");
    title.textContent = `${group.name} · ${l.instrument} ${l.resolution_m} m`;
    keyEl.append(title);
    const visorId = group.name === "Minerals" ? "minerals_frt0000b6f1" : l.id;   // the 3D sim paints this scene
    if (VISOR_IDS.has(visorId) && onShowOnVisor) {
      const b = document.createElement("button");
      b.textContent = "Show on visor";
      b.addEventListener("click", () => onShowOnVisor(byId.get(visorId)));
      keyEl.append(b);
    }
    if (group.ids.length > 1) {                      // minerals: pick the CRISM scene
      const pick = document.createElement("select");
      for (const id of group.ids) pick.append(new Option(`${byId.get(id).scene ?? id} (${byId.get(id).date ?? ""})`, id, false, id === l.id));
      pick.addEventListener("change", () => show(pick.value));
      keyEl.append(pick);
    }
    for (const item of l.legend ?? []) {
      const row = document.createElement("div");
      const chip = document.createElement("i");
      chip.style.background = item.color;
      row.append(chip, document.createTextNode(` ${shortLabel(item.label)}`));
      keyEl.append(row);
    }
    const credit = document.createElement("small");
    credit.textContent = l.credit;
    keyEl.append(credit);
  }

  show(null);
  return { layers: data.layers, showPhoto: () => show(null) };
}

/** Stop label with what the layers say at that stop, e.g. "2 · Steep ridge · slope 22° · TI 396". */
export function stopLabel(stop, layers = []) {
  const at = (id) => layers.find((l) => l.id === id)?.stops?.find((s) => s.id === stop.id);
  const slope = at("slope")?.slope_deg;
  const ti = at("thermal")?.thermal_inertia;
  return [`${stop.id} · ${stop.name}`, slope != null ? `slope ${Math.round(slope)}°` : "", ti != null ? `TI ${ti}` : ""]
    .filter(Boolean).join(" · ");
}

/** Legend text without the details: "magenta: polyhydrated sulfates (1.9 µm)" → "polyhydrated sulfates". */
export const shortLabel = (label) => String(label).split(":").pop().split("(")[0].trim();

/** The zones as a map layer: built from the real height map and the THEMIS / CRISM images (null if missing). */
async function zonesLayer(base, bounds) {
  try {
    const meta = await (await fetch(new URL("../terrain/terrain.json", new URL(base, location.href)))).json();
    const buf = await (await fetch(new URL("../terrain/heights.bin", new URL(base, location.href)))).arrayBuffer();
    const grid = createTerrainGrid({ ...meta, heights: new Float32Array(buf) });
    const canvas = await zonesCanvas(grid, new URL("layers.json", new URL(base, location.href)).href);
    return { ...ZONES_KEY, kind: "safety", mission: "MRO + Odyssey", bounds: bounds ?? meta.bounds, url: canvas.toDataURL(),
      credit: "Slope and rough ground: HiRISE 1 m DEM (NASA/JPL/UArizona) · looser ground: THEMIS (NASA/JPL/ASU) · sulfates: CRISM (NASA/JPL/JHUAPL)" };
  } catch (error) {
    console.warn("[map] zones not available:", error?.message ?? error);
    return null;
  }
}
