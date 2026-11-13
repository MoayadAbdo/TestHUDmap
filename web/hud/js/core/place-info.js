/**
 * "What's here?": turns the astronaut's Mars position into short facts from the real layers
 * (web/mission/knowledge/grid.json, made by builder/knowledge.py) plus the nearest stop.
 * Used by the info card on the HUD and by the voice agent's get_location_info tool.
 */
const MARS_R = 3396190;
const NEAR_STOP_M = 40;

const rad = (d) => (d * Math.PI) / 180;
function distanceM([lat1, lon1], [lat2, lon2]) {
  const x = rad(lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2)), y = rad(lat2 - lat1);
  return Math.hypot(x, y) * MARS_R;
}

/** Index of the 10 m cell at (lat, lon), or -1 outside the mapped area. */
export function cellIndex(grid, lat, lon) {
  const { north, south, west, east } = grid.bounds;
  if (lat > north || lat < south || lon < west || lon > east) return -1;
  const col = Math.min(grid.cols - 1, Math.floor(((lon - west) / (east - west)) * grid.cols));
  const row = Math.min(grid.rows - 1, Math.floor(((north - lat) / (north - south)) * grid.rows));
  return row * grid.cols + col;
}

function slopeLine(steep) {
  if (steep >= 40) return `Very broken ground: ${steep}% of this spot is steeper than 15°. Walk slowly.`;
  if (steep >= 15) return `Some steep spots here (${steep}% over 15°). Watch your footing.`;
  return 'Gentle ground here.';
}

function mineralLine(code, pct, names) {
  if (!code) return 'No clear water-mineral signal from orbit here.';
  const what = code === 3 ? 'minerals that hold water' : names[code];
  return `Orbit data hints at ${what} (stronger than ${pct}% of the scene). They form with water; only spectra confirm it.`;
}

function groundLine(ti) {
  if (ti < 380) return `Heat data (${ti}) suggests more dust or loose sand.`;
  if (ti > 415) return `Heat data (${ti}) suggests firm rock.`;
  return `Heat data (${ti}) suggests sand mixed with rock.`;
}

/**
 * Facts for one spot. Returns null outside the mapped area.
 * { here: {...numbers}, stop: {id, name, distance_m} | null, lines: [{ kind, icon, text }], sources: [...] }
 */
export function placeInfo({ grid, mission, facts = null, lat, lon }) {
  const i = cellIndex(grid, lat, lon);
  if (i < 0) return null;
  const here = {
    height_m: grid.height_m[i], steep_pct: grid.steep_pct[i],
    mineral: grid.mineral_names[grid.mineral[i]], mineral_pct: grid.mineral_pct[i], ti: grid.ti[i],
  };
  const near = (mission?.stops ?? [])
    .map((s) => ({ s, d: distanceM([lat, lon], s.mars) }))
    .sort((a, b) => a.d - b.d)[0];
  const stop = near && near.d <= NEAR_STOP_M ? { id: near.s.id, name: near.s.name, distance_m: Math.round(near.d) } : null;

  const lines = [];
  const factSources = new Set();
  if (stop) lines.push({ kind: 'stop', icon: '📍', text: `Near stop ${stop.id}: ${stop.name} (${stop.distance_m} m)` });
  // hand-written science (web/mission/knowledge/facts.json): the stop's facts, or one area fact between stops
  const f = stop && facts?.stops?.find((x) => x.id === stop.id);
  if (f) {
    const where = f.scope === 'area' ? 'In this boxwork area: ' : '';
    lines.push({ kind: 'curiosity', icon: '🔬', text: where + f.curiosity });
    lines.push({ kind: 'look_for', icon: '👀', text: `Look for: ${f.look_for}` });
    lines.push({ kind: 'why', icon: '💡', text: f.why_it_matters });
    factSources.add(facts.sources?.[f.source] ?? f.source);
  } else if (facts?.area?.length) {
    const a = facts.area[Math.abs(Math.round(lat * 1e5 + lon * 1e5)) % facts.area.length];   // same spot, same fact
    lines.push({ kind: 'area', icon: '💡', text: a.text });
    factSources.add(facts.sources?.[a.source] ?? a.source);
  }
  lines.push({ kind: 'slope', icon: '⛰', text: slopeLine(here.steep_pct) });
  lines.push({ kind: 'mineral', icon: '💧', text: mineralLine(grid.mineral[i], here.mineral_pct, grid.mineral_names) });
  lines.push({ kind: 'ground', icon: '🪨', text: groundLine(here.ti) });
  lines.push({ kind: 'height', icon: '↕', text: `${here.height_m >= 0 ? '+' : ''}${Math.round(here.height_m)} m compared with the base` });

  const scene = grid.mineral_scenes?.[grid.mineral_scene[i]]?.scene;
  const sources = ['MRO HiRISE 1 m heights and slope', `MRO CRISM${scene ? ` ${scene}` : ''}`, 'Mars Odyssey THEMIS', ...factSources];
  return { here, stop, lines, sources };
}

const PRIORITY = ['stop', 'curiosity', 'look_for', 'slope', 'mineral', 'why', 'area', 'ground', 'height'];

/** The most important lines first: what's here and what to do, then dangers, then the rest. Calm ground and no-signal lines go last. */
export function importantLines(info, max = 5) {
  const rank = (l) => {
    let r = PRIORITY.indexOf(l.kind);
    if (l.kind === 'slope' && info.here.steep_pct < 15) r += 10;          // gentle ground: not important
    if (l.kind === 'mineral' && /No clear/.test(l.text)) r += 10;       // no signal: not important
    return r;
  };
  return [...info.lines].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

/** Card title: the stop's name, or "between stops". */
export function infoTitle(info) {
  return info.stop ? info.stop.name : 'Between stops';
}
