/**
 * Science samples, one per stop: logged by looking at the stop's glowing rock for 2 s (3D sim), or in camera mode
 * by the photo taken when you arrive. The visor, the voice agent and Ground Control all read the same list.
 */
export function createScience({ stops }) {
  const samples = [];
  return {
    /** Log a stop's sample once; returns the new sample, or null if it was already logged (or unknown). */
    log(stopId, how, t) {
      if (samples.some((s) => s.id === stopId)) return null;
      const stop = stops.find((s) => s.id === stopId);
      if (!stop) return null;
      const sample = { id: stopId, name: stop.name, how, t };
      samples.push(sample);
      return sample;
    },
    has: (stopId) => samples.some((s) => s.id === stopId),
    get done() { return samples.length; },
    get total() { return stops.length; },
    get last() { return samples[samples.length - 1] ?? null; },
    list: () => samples.map((s) => ({ ...s })),
  };
}
