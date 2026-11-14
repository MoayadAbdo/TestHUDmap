// Every line the phone may say on its own (alerts, arrivals, samples): id → text.
// Recorded in the voice agent's voice by make-voice-clips-elevenlabs.mjs, so the suit has one voice.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Every line the phone may say: id → text. Stop names come from mission.json. */
export function clipTexts(mission) {
  const stops = mission.stops.filter((s) => !s.is_base);
  const lines = {
    return_reserve: 'Return to base. Oxygen reserve reached.',
    return_low_o2: 'Return to base. Oxygen low.',
    return_solar: 'Return to base. Solar storm, radiation rising.',
    return_o2leak: 'Return to base. Suit oxygen leak.',
    return_ground: 'Return to base. Ground Control ordered return.',
    return_generic: 'Return to base.',
    solar: 'Solar storm. Radiation rising.',
    o2leak: 'Suit oxygen leak.',
    low_o2: 'Oxygen low.',
    slope_nogo: 'No-go slope ahead. Do not go on.',
    slope_ahead: 'Steep ground ahead. Slow down.',
    slope_close: 'No-go slope close by. Watch your step.',
    gc_message: 'Message from Ground Control.',
    all_done: 'All stops done. Walk back to base.',
  };
  for (const s of stops) lines[`arrive_${s.id}`] = `Stop ${WORDS[s.id] ?? s.id} reached. ${s.name}.`;
  for (let n = 1; n <= stops.length; n++) lines[`sample_${n}`] = `Sample logged. ${WORDS[n]} of ${WORDS[stops.length]}.`;
  return lines;
}
