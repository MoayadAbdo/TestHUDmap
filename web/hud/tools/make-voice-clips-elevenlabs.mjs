// Records every spoken alert in the voice agent's own voice, so the suit has one voice: the AI's.
// The clips are files, so alerts still play offline at the event, and credits are spent once, here.
//
//   ELEVENLABS_API_KEY=... ELEVENLABS_AGENT_ID=agent_... node web/hud/tools/make-voice-clips-elevenlabs.mjs
//
// The voice (and its settings) is read from the agent, so it always matches the agent.
// Or give a voice ID instead of the agent: node web/hud/tools/make-voice-clips-elevenlabs.mjs <voiceId>
// The key and the agent ID are read from the environment only; they are never written anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipTexts } from './clip-texts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'sounds');
const MISSION = path.resolve(HERE, '..', '..', 'mission', 'mission.json');
const API = 'https://api.elevenlabs.io/v1';
const FALLBACK_MODEL = 'eleven_multilingual_v2';
const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;

if (!key) { console.error('Set ELEVENLABS_API_KEY first (ElevenLabs → Developers → API keys; text to speech + agents read).'); process.exit(1); }

/** The agent's voice: voice ID, TTS model and voice settings, from the agent's config. */
async function agentVoice(id) {
  const res = await fetch(`${API}/convai/agents/${encodeURIComponent(id)}`, { headers: { 'xi-api-key': key } });
  if (!res.ok) { console.error(`Could not read the agent (${res.status}): ${await res.text()}`); process.exit(1); }
  const tts = (await res.json())?.conversation_config?.tts ?? {};
  if (!tts.voice_id) { console.error('The agent has no voice set (Agent → Voice).'); process.exit(1); }
  return { voiceId: tts.voice_id, model: tts.model_id, settings: { stability: tts.stability, similarity_boost: tts.similarity_boost, speed: tts.speed } };
}

const voice = agentId ? await agentVoice(agentId) : process.argv[2] ? { voiceId: process.argv[2] } : null;
if (!voice) { console.error('Set ELEVENLABS_AGENT_ID (or pass a voice ID) so the alerts use the agent\'s voice.'); process.exit(1); }
const settings = Object.fromEntries(Object.entries(voice.settings ?? {}).filter(([, v]) => typeof v === 'number'));
let model = voice.model ?? FALLBACK_MODEL;

async function speak(text) {
  const res = await fetch(`${API}/text-to-speech/${voice.voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.6, similarity_boost: 0.8, ...settings } }),
  });
  return res;
}

const texts = clipTexts(JSON.parse(fs.readFileSync(MISSION, 'utf8')));
fs.mkdirSync(OUT, { recursive: true });
console.log(`Voice ${voice.voiceId}${agentId ? ' (from the agent)' : ''}, model ${model}`);
let n = 0;
for (const [id, text] of Object.entries(texts)) {
  let res = await speak(text);
  // agent-only models (conversational) may not be offered for plain text to speech: same voice, standard model
  if (!res.ok && n === 0 && model !== FALLBACK_MODEL && res.status < 500) {
    console.log(`Model ${model} not available for text to speech (${res.status}); using ${FALLBACK_MODEL} with the same voice.`);
    model = FALLBACK_MODEL;
    res = await speak(text);
  }
  if (!res.ok) { console.error(`${id}: ElevenLabs said ${res.status} ${await res.text()}`); process.exit(1); }
  fs.writeFileSync(path.join(OUT, `${id}.mp3`), Buffer.from(await res.arrayBuffer()));
  n += 1;
  process.stdout.write(`\r${n}/${Object.keys(texts).length} ${id}            `);
}
fs.writeFileSync(path.join(OUT, 'clips.json'),
  `${JSON.stringify({ voice: `elevenlabs:${voice.voiceId}`, source: agentId ? 'voice agent' : 'voice id', model, ext: 'mp3', clips: texts }, null, 1)}\n`);
console.log(`\nDone: ${n} clips in the agent's voice → web/hud/sounds (commit and push to use them).`);
