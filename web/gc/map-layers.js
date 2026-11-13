// Map layers from mission/layers/layers.json on the Ground Control map: slope, minerals (3 CRISM scenes), heat,
// wider CTX context; a menu to pick them, a colour key for the one on top, and "Show on visor" to paint the same
// layer on the astronaut's 3D ground. Stops get their slope and thermal inertia in the label.
const VISOR_IDS = new Set(["slope", "minerals_frt0000b6f1", "thermal"]);   // the layers the 3D sim can paint

export async function addMapLayers({ map, L, base = "../mission/layers/", onShowOnVisor }) {
  const data = await fetch(base + "layers.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!data) return null;
  const box = (b) => [[b.south, b.west], [b.north, b.east]];
  const overlays = {};
  const byLayer = new Map();
  for (const l of data.layers) {
    if (!l.file || l.id === "photo" || l.id === "heights") continue;
    const overlay = L.imageOverlay(base + l.file, box(l.bounds), {
      opacity: l.kind === "optical" ? 1 : 0.65, attribution: l.credit, className: l.resolution_m >= 10 ? "pixelated" : "",
    });
    overlays[`${l.name} · ${l.instrument} ${l.resolution_m} m`] = overlay;
    byLayer.set(overlay, l);
  }
  L.control.layers(null, overlays, { collapsed: false, position: "topright" }).addTo(map);

  const key = L.control({ position: "topleft" });
  key.onAdd = () => L.DomUtil.create("div", "layer-key");
  key.addTo(map);
  const el = key.getContainer();
  L.DomEvent.disableClickPropagation(el);
  function showKey(l) {
    el.replaceChildren();
    if (!l) { el.hidden = true; return; }
    el.hidden = false;
    const title = document.createElement("b");
    title.textContent = `${l.name} (${l.mission} ${l.instrument}, ${l.resolution_m} m)`;
    el.append(title);
    for (const item of l.legend ?? []) {
      const row = document.createElement("div");
      const chip = document.createElement("i");
      chip.style.background = item.color;
      row.append(chip, document.createTextNode(` ${item.label}`));
      el.append(row);
    }
    const credit = document.createElement("small");
    credit.textContent = l.credit;
    el.append(credit);
    if (VISOR_IDS.has(l.id) && onShowOnVisor) {
      const b = document.createElement("button");
      b.textContent = "Show on visor";
      b.addEventListener("click", () => onShowOnVisor(l));
      el.append(b);
    }
  }
  showKey(null);
  map.on("overlayadd", (e) => showKey(byLayer.get(e.layer)));
  map.on("overlayremove", () => {
    const top = [...byLayer.keys()].reverse().find((o) => map.hasLayer(o));
    showKey(top ? byLayer.get(top) : null);
  });
  return data.layers;
}

/** Stop label with what the layers say at that stop, e.g. "2 · Steep ridge · slope 22° · TI 396". */
export function stopLabel(stop, layers = []) {
  const at = (id) => layers.find((l) => l.id === id)?.stops?.find((s) => s.id === stop.id);
  const slope = at("slope")?.slope_deg;
  const ti = at("thermal")?.thermal_inertia;
  return [`${stop.id} · ${stop.name}`, slope != null ? `slope ${Math.round(slope)}°` : "", ti != null ? `TI ${ti}` : ""]
    .filter(Boolean).join(" · ");
}
