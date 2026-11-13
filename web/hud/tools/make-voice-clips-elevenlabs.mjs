// Records every spoken alert with ElevenLabs, so warnings sound like the suit's AI (same voice for every phone,
// played from files: offline at the event, and the credits are spent once, here).
//
//   ELEVENLABS_API_KEY=... node web/hud/tools/make-voice-clips-elevenlabs.mjs [voiceId]
//
// voiceId: the voice of your agent (ElevenLabs → Agents → your agent → Voice → copy the voice ID).
// Default: "Rachel". The key is read from the environment only; it is never written anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipTexts } from './make-voice-clips.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'sounds');
const MISSION = path.resolve(HERE, '..', '..', 'mission', 'mission.json');
const key = process.env.ELEVENLABS_API_KEY;
const voiceId = process.argv[2] ?? '21m00Tcm4TlvDq8ikWAM';
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';

if (!key) { console.error('Set ELEVENLABS_API_KEY first (ElevenLabs → Profile → API keys).'); process.exit(1); }

const texts = clipTexts(JSON.parse(fs.readFileSync(MISSION, 'utf8')));
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [id, text] of Object.entries(texts)) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.6, similarity_boost: 0.8 } }),
  });
  if (!res.ok) { console.error(`${id}: ElevenLabs said ${res.status} ${await res.text()}`); process.exit(1); }
  fs.writeFileSync(path.join(OUT, `${id}.mp3`), Buffer.from(await res.arrayBuffer()));
  n += 1;
  process.stdout.write(`\r${n}/${Object.keys(texts).length} ${id}            `);
}
fs.writeFileSync(path.join(OUT, 'clips.json'), `${JSON.stringify({ voice: `elevenlabs:${voiceId}`, model: MODEL, ext: 'mp3', clips: texts }, null, 1)}\n`);
console.log(`\nDone: ${n} clips in ElevenLabs voice ${voiceId} → web/hud/sounds (commit and push to use them).`);
