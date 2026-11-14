/**
 * Ground Control tiles for MarStep (the HUD's energy model, web/hud/js/core/marstep.js).
 * Pure: telemetry in, { id: { text, note, cls } } out, so it can be tested without a page.
 */
const hm = (min) => (min == null ? "—" : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`);
const dist = (m) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function marstepTiles(t) {
  const ms = t?.marstep;
  const margin = t?.return_margin;
  const tiles = {
    msMargin: {
      text: margin == null ? "—" : margin >= 10 ? "×10+" : `×${margin.toFixed(1)}`,
      note: t?.o2_home_pct != null ? `home needs ${t.o2_home_pct}% O₂` : "",
      cls: margin == null ? "" : margin < 1 ? "bad" : margin < 1.5 ? "warn" : "",
    },
    msTurn: { text: "—", note: "", cls: "" },
    msReach: { text: "—", note: "", cls: "" },
    msEffort: { text: t?.effort_w != null ? `${t.effort_w} W` : "—", note: "", cls: "" },
    msNext: { text: "—", note: "", cls: "" },
    msUsed: { text: "—", note: "", cls: "" },
  };
  if (!ms) return tiles;
  tiles.msTurn = {
    text: ms.turn_back_min > 0 ? hm(ms.turn_back_min) : "NOW",
    note: ms.linger_min != null ? `standing: ${hm(ms.linger_min)}` : "",
    cls: !(ms.turn_back_min > 0) ? "bad" : ms.turn_back_min < 20 ? "warn" : "",
  };
  tiles.msReach = {
    text: dist(ms.reach_m),
    note: ms.terrain_tax != null ? `terrain +${Math.round(ms.terrain_tax * 100)}% on the way home` : "",
    cls: "",
  };
  tiles.msEffort.note = [ms.zone, ms.peak_min > 0 ? `${ms.peak_min} min over peak` : ""].filter(Boolean).join(" · ");
  tiles.msEffort.cls = ms.zone === "PEAK" ? "bad" : ms.zone === "HARD" ? "warn" : "";
  if (ms.next) {
    tiles.msNext = {
      text: `${ms.next.call}${ms.next.margin != null ? ` ×${ms.next.margin >= 10 ? "10+" : ms.next.margin}` : ""}`,
      note: "margin on arrival",
      cls: ms.next.call === "SKIP" ? "bad" : ms.next.call === "TIGHT" ? "warn" : "",
    };
  }
  if (ms.used) {
    const u = ms.used;
    tiles.msUsed = { text: `${u.o2L} L O₂`, note: `${u.co2L} L CO₂ · ${u.kcal} kcal · ${u.coolingWaterL} L water`, cls: "" };
  }
  return tiles;
}
