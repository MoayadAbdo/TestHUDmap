// Records every spoken alert once, in one voice, so every phone sounds the same (offline, no credits).
// macOS only (uses `say` and `afconvert`). Run from the repo root:
//   node web/hud/tools/make-voice-clips.mjs            # voice Samantha
//   node web/hud/tools/make-voice-clips.mjs Daniel     # any voice from `say -v '?'`
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'sounds');
const MISSION = path.resolve(HERE, '..', '..', 'mission', 'mission.json');
const voice = process.argv[2] ?? 'Samantha';
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

function main() {
  const mission = JSON.parse(fs.readFileSync(MISSION, 'utf8'));
  const texts = clipTexts(mission);
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-'));
  for (const [id, text] of Object.entries(texts)) {
    const aiff = path.join(tmp, `${id}.aiff`);
    execFileSync('say', ['-v', voice, '-r', '175', '-o', aiff, text]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', '-c', '1', aiff, path.join(OUT, `${id}.m4a`)]);
  }
  fs.writeFileSync(path.join(OUT, 'clips.json'), `${JSON.stringify({ voice, clips: texts }, null, 1)}\n`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${Object.keys(texts).length} clips in ${voice} → ${path.relative(process.cwd(), OUT)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
