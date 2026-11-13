# ai/ (AI2)
ElevenLabs voice assistant for the Mars Walk HUD. Task: T1.2 in docs/backlog.md.

- `prompt.md`: system prompt and `get_status` tool description to paste into ElevenLabs.
- `knowledge-base/official/`: knowledge files to upload (made by `npm run kb:export:official`).
- `tests.md`: live voice test results and the re-test list.

Never commit an ElevenLabs API key or the agent ID. The repo is public.

## Set up

Needs Node 22.12 or newer (vite 8 and vitest 5).

```bash
cd ai
npm ci
```

## Dev page

Copy `.env.example` to `.env.development.local` (git ignores it) and set:

```dotenv
VITE_ELEVENLABS_AGENT_ID=YOUR_AGENT_ID
VITE_MISSION_DATA_SOURCE=mock
```

Use `.env.development.local`, not `.env.local`: `build:hud` refuses to run while the id is in `.env` or `.env.local`.

```bash
npm run dev
```

## Tests

```bash
npm test          # 103 tests
npm run typecheck
```

`npm run build` only checks that the dev page compiles.

## HUD build

`src/hudBridge.ts` gives the HUD `toggleVoice()`, `getConversation().sendContextualUpdate()`, `onAgentText()`, `onUserText()`, `isListening()` and `getVoiceState()`, and reads live status from `window.hud.getStatus()`.

```bash
npm run build:hud   # writes ../web/ai/voice.js
```

- The agent ID is read **at runtime only**. Open the HUD once with `?agent=<id>`; the phone remembers it (localStorage).
- `build:hud` stops with an error if `VITE_ELEVENLABS_AGENT_ID` is set in the shell, `.env`, `.env.local` or `.env.hud*`.
- `voice.js` holds only the voice code. It no longer bundles mission data, so it doesn't need a rebuild when `web/mission/mission.json` changes.
- The visor shows only short errors ("AI offline: no connection", "AI not set up: open with ?agent=<id>"). Details go to the browser console.

## Knowledge files

| File | What it is |
|---|---|
| `knowledge-base/official/mission_stops.txt`, `boxwork.txt` | **Upload these.** Made from `web/mission/mission.json` |
| `knowledge/mission_stops_MOCK.txt` | **MOCK.** Made-up demo stops. Do not upload with the official files |
| `knowledge/boxwork.txt` | Copy of `src/data/boxwork.txt` |
| `src/data/mission.json` | Copy of `web/mission/mission.json` (refreshed by `npm run sync:mission`) |

Re-run `npm run kb:export:official` whenever `web/mission/mission.json` changes. It copies the file, then writes `knowledge-base/official/`. The copies above are kept on purpose; edit `src/data/boxwork.txt` and `web/mission/mission.json`, not the copies.

See `docs/REPLACING_MOCK_DATA.md` for the data mapping.

## Owner checklist (by hand in ElevenLabs; can't be done from code)

1. Turn on **authentication** for the agent, or set the **domain allowlist** to the deployed HUD domain only. Publish, then check a session can't start from another site.
2. Paste the system prompt and the `get_status` tool description from `prompt.md`. Publish.
3. Knowledge base: remove `mission_stops_MOCK.txt` and the old `boxwork.txt`; upload both files from `knowledge-base/official/`.
4. Open the HUD once on each phone with `?agent=<id>`. Don't share that link in the public repo.
5. Run the re-test list in `tests.md` (section 2b) and record the results.
