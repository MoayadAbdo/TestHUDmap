// Science readout: "2/5" with the last sample's name, and one alert-log line per new sample.
// The phone sends science: { done, total, last } and samples: [{ id, name, how, t }] in its telemetry.

const MAX_NAME = 60;

/** The tile's text; "—" until the phone sends science. */
export function scienceText(science) {
  const known = Number.isFinite(science?.done) && Number.isFinite(science?.total);
  return {
    value: known ? `${science.done}/${science.total}` : "—",
    last: known && typeof science.last === "string" ? science.last.slice(0, MAX_NAME) : "",
  };
}

/** Returns fresh(samples): the samples not seen before (a sample is its id and time). */
export function createSampleLog() {
  const seen = new Set();
  return (samples) => (Array.isArray(samples) ? samples : []).filter((s) => {
    if (!s || typeof s !== "object") return false;
    const key = `${s.id}|${s.t}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sampleLine(sample) {
  const name = String(sample.name ?? `stop ${sample.id}`).slice(0, MAX_NAME);
  return `SAMPLE logged: ${name}${sample.how ? ` (${sample.how})` : ""}`;
}

/** value, last: the tile's elements; log(text, kind): the alert log. */
export function createScienceReadout({ value, last, log }) {
  const fresh = createSampleLog();
  return {
    update(telemetry) {
      const text = scienceText(telemetry.science);
      value.textContent = text.value;
      last.textContent = text.last;
      for (const sample of fresh(telemetry.samples)) log(sampleLine(sample), "science");
    },
  };
}
