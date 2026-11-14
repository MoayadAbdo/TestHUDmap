/**
 * Until the alert lines are recorded in the voice agent's voice (sounds/*.mp3), the phone says them with its own
 * text-to-speech, so a warning is never silent. texts: id → line (clip-texts.js). synth: the browser's speechSynthesis.
 */
export function createSpeechFallback({ texts, synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance }) {
  if (!synth || !Utterance) return null;
  return (id, { urgent = false } = {}) => {
    const text = texts[id];
    if (!text) return;
    if (urgent) synth.cancel();
    const line = new Utterance(text);
    line.lang = 'en-US';
    line.rate = 1.05;
    synth.speak(line);
  };
}
