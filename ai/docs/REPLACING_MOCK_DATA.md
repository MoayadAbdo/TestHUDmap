# Replacing Mock Mission Data with Official T1.1 Data

This guide covers switching the Mars Suit Assistant from the **fictional mock mission** (`src/data/mission.mock.json`) to the **official T1.1 `mission.json` and stop cards**.

**The rule:** business logic (`src/services/*`, `src/stopCards/*`, `src/knowledge/*`) should **never** need to change. All changes go in exactly three places:

| What changes | Where |
|---|---|
| Which data source is used | `VITE_MISSION_DATA_SOURCE` env var (read in `src/config/missionDataConfig.ts`) |
| How raw JSON maps to the internal model | `mapRawMission` / `mapRawStop` in `src/adapters/missionDataAdapter.ts` |
| Where stop cards come from | `createStopCardProvider` in `src/config/missionDataConfig.ts` |

---

## Before you start: check what you received

1. Save the file T1.1 sent as **`src/data/mission.json`**. The name and location must match exactly.
2. Open it and compare it with `src/data/mission.mock.json`:
   - Does it have `mission_id`, `mission_name`, `location`, and `stops[]`, with each stop having `id` (integer), `name`, `description`, and `tasks` (string array)?
   - **Yes, exactly** → [Scenario A](#scenario-a--official-json-matches-our-schema)
   - **No** (different names, nesting, or types) → [Scenario B](#scenario-b--official-json-has-a-different-schema)
3. Are stop cards in separate files? → also do [Scenario C](#scenario-c--official-stop-cards-come-as-separate-files).
4. Always finish with [Scenario D](#scenario-d--replacing-the-elevenlabs-knowledge-base).

Never edit `mission.mock.json` into the official data. Keep the mock file as it is so that mock mode keeps working for development.

---

## Scenario A — Official JSON matches our schema

1. **Place the file:** `src/data/mission.json`.
   - Make sure it does **not** contain `"is_mock": true`. Official mode rejects it on purpose.
2. **Switch to official data.** Create `.env.local` in the project root (Vite loads it automatically):
   ```bash
   VITE_MISSION_DATA_SOURCE=official
   ```
   For a one-off run: `VITE_MISSION_DATA_SOURCE=official npm run dev`.
3. **Validate** by running the export, which loads the file through the real adapter:
   ```bash
   npm run kb:export -- official
   ```
   - Success: `knowledge-base/official/mission_stops.txt` is written. Read it and check stops and tasks against what T1.1 sent.
   - Failure: you get a `MissionDataValidationError` that lists every problem with its JSON path, e.g. `stops[2].description: required field is missing`. Ask T1.1 for the missing data. **Don't fill in values yourself.** If the schema is actually different, go to Scenario B.
4. **Run the checks:**
   ```bash
   npm run check
   VITE_MISSION_DATA_SOURCE=official npm test
   ```
5. In the app, `missionService.isMockData()` should now return `false`, and every `StopCard.source` should be `"official"`.

Nothing else changes. No service or test code is edited.

---

## Scenario B — Official JSON has a different schema

**The only file to edit is `src/adapters/missionDataAdapter.ts`**, in the section marked `EDIT THIS SECTION`.

### Step 1 — Map the fields

Say T1.1 sends:

```json
{
  "mission": { "code": "SA-2026-01", "title": "Boxwork Traverse", "site": "Mount Sharp, Gale Crater" },
  "waypoints": [
    { "seq": 1, "label": "Observation Point", "summary": "…", "activities": [{ "text": "…" }] }
  ]
}
```

Rewrite the two mapping functions. `FieldReader` (`r`) handles required-field and type checks, and each call takes `(object, key, path for error messages)`:

```ts
function mapRawMission(raw: unknown, r: FieldReader, source: MissionDataSource): MissionData | undefined {
  if (!isRecord(raw)) {
    r.issues.push(`(root): expected a JSON object, got ${describe(raw)}`);
    return undefined;
  }
  const header = isRecord(raw.mission) ? raw.mission : {};
  if (!isRecord(raw.mission)) r.issues.push("mission: required object is missing");

  return {
    missionId:   r.string(header, "code",  "mission.code"),
    missionName: r.string(header, "title", "mission.title"),
    location:    r.string(header, "site",  "mission.site"),
    source,
    stops: r.array(raw, "waypoints", "waypoints")
            .map((w, i) => mapRawStop(w, r, `waypoints[${i}]`)),
  };
}

function mapRawStop(raw: unknown, r: FieldReader, path: string): MissionStop {
  if (!isRecord(raw)) {
    r.issues.push(`${path}: expected an object, got ${describe(raw)}`);
    return { id: NaN, name: "", description: "", tasks: [] };
  }
  return {
    id:          r.integer(raw, "seq",     `${path}.seq`),
    name:        r.string(raw,  "label",   `${path}.label`),
    description: r.string(raw,  "summary", `${path}.summary`),
    tasks: r.array(raw, "activities", `${path}.activities`).map((a, j) =>
      isRecord(a) ? r.string(a, "text", `${path}.activities[${j}].text`) : ""),
  };
}
```

Rules while mapping:
- **Never invent values.** If the official data really has no `description`, don't write `?? "No description"`. Agree with the team on whether the field becomes optional, then change `MissionStop` in `src/contracts/MissionData.ts` **on purpose** and let `tsc` show you every consumer that needs updating.
- **Extra official fields** (coordinates, hazards, timings, …): ignore them for now, or add them to `MissionStop` as a deliberate contract change. Don't pass raw objects through.
- **Stop IDs** must be positive, unique integers that match what the HUD reports in `MissionStatus.stop`. If the official IDs are strings like `"S1"`, convert them here and coordinate with the HUD developer.
- Leave `validateMission` alone. It checks the normalized model, not the raw schema.
- Since `mission.mock.json` no longer matches the mapping, decide whether to **(a)** update `mission.mock.json` to the official shape (keep `"is_mock": true` and the fictional values), or **(b)** keep two mapping functions, chosen by `source`. Option (a) is simpler and keeps a single adapter.

### Step 2 — Validate the output

1. Add a test in `tests/missionData.test.ts` that feeds a small **sample in the official shape** to `normalizeMissionData(sample, { source: "official" })` and checks the normalized result with `toEqual`.
2. Add one or two invalid samples (missing required field, wrong type) and check the issue paths.
3. Run the export against the real file and read the output:
   ```bash
   npm run kb:export -- official
   npm run check
   ```
4. The existing service and stop card tests must pass **unchanged**. If one fails, the mapping produced something other than valid `MissionData`. Fix the adapter, not the test.

---

## Scenario C — Official stop cards come as separate files

The default stop cards are **built from mission data** (`MissionStopCardProvider`). If T1.1 sends official stop cards as separate files (e.g. `src/data/stop-cards/stop-1.json`, …):

1. **Place the files** under `src/data/stop-cards/`.
2. **Add one provider**, `src/stopCards/OfficialStopCardProvider.ts`, that implements `StopCardProvider`. It loads the files, validates them, and returns `StopCard[]`. Keep its raw-to-`StopCard` mapping in that one file (it acts as the stop card adapter):
   ```ts
   import type { MissionDataProvider, StopCard, StopCardProvider } from "../contracts/MissionData";

   const files = import.meta.glob("../data/stop-cards/*.json", { eager: true, import: "default" });

   export class OfficialStopCardProvider implements StopCardProvider {
     constructor(private readonly missionProvider: MissionDataProvider) {}

     async getStopCards(): Promise<StopCard[]> {
       const mission = await this.missionProvider.getMission();
       const knownIds = new Set(mission.stops.map((s) => s.id));
       return Object.entries(files).map(([file, raw]) => {
         const card = mapRawStopCard(raw, file, mission.missionId);  // validate; throw on missing fields
         if (!knownIds.has(card.stopId)) {
           throw new Error(`${file}: stop ${card.stopId} is not in mission.json`);
         }
         return card;
       });
     }
   }
   ```
   It takes the `MissionDataProvider` so it can **check** the cards against the mission's stops, not so it can copy stop data.
3. **Switch in the composition root:** in `src/config/missionDataConfig.ts`, change `createStopCardProvider` to:
   ```ts
   return new OfficialStopCardProvider(missionProvider);
   ```
   (Return `MissionStopCardProvider` in mock mode if you want mock mode to keep the generated cards.)
4. **Avoid duplicated data:** if a card repeats the stop name or description, decide which one is authoritative. Don't keep both by hand. Typically the card file holds card-only content, and name and description come from `mission.json`.
5. Add tests for the new provider (valid files, unknown stop ID, missing field). `StopCardService`, the HUD code, and the KB export stay **unchanged**, because they only see `StopCard`.

If the official stop cards are PDFs or images for display only, they aren't data. Upload them to the Knowledge Base (Scenario D) and keep the generated cards for the HUD.

---

## Scenario D — Replacing the ElevenLabs Knowledge Base

**ElevenLabs doesn't sync with this repo.** Changing local files, redeploying, or running `kb:export` doesn't update the agent. You have to update the Knowledge Base by hand. No step below changes the agent's prompt, voice, tools (`get_status`), or other configuration.

1. **Generate the files** from validated official data (copies `web/mission/mission.json` first):
   ```bash
   npm run kb:export:official
   ```
   Output: `knowledge-base/official/mission_stops.txt` and `knowledge-base/official/boxwork.txt`.
2. **Review `boxwork.txt`.** Done on 13 Nov 2026: its STOP CARDS section now points to the stop cards file. Edit `src/data/boxwork.txt` if it needs more changes, then run the export again.
3. In the **ElevenLabs dashboard**, open the Mars Suit Assistant agent's **Knowledge Base**:
   1. **Remove** the mock document `mission_stops_MOCK.txt` and the old `boxwork.txt`. Removing mock data matters: if it stays, the agent can quote fictional stops.
   2. **Upload** `knowledge-base/official/mission_stops.txt` and `knowledge-base/official/boxwork.txt`.
   3. If T1.1 gave official stop-card documents (PDFs etc.), upload those too.
   4. Make sure the new documents are **attached to the agent**, not just stored in the workspace library.
4. **Test in the dashboard**: ask "What are my tasks at stop 2?" and "What is boxwork?" and check the answers match the official data. Ask about a stop that doesn't exist and confirm the agent doesn't make one up.
5. Repeat steps 1–4 **every time** `mission.json`, the stop cards, or `boxwork.txt` change.

---

## Returning to mock mode (development)

1. Delete `VITE_MISSION_DATA_SOURCE` from `.env.local`, or set `VITE_MISSION_DATA_SOURCE=mock`. Mock is the default.
2. You can leave `src/data/mission.json` where it is. Mock mode ignores it.
3. `npm run kb:export` regenerates `knowledge-base/mock/`.
4. If the ElevenLabs agent should use mock data again (e.g. a dev copy of the agent), re-upload the mock files there. Don't mix mock and official documents in the same agent.

## Troubleshooting

| Error | Meaning / fix |
|---|---|
| `Official mission data requested but src/data/mission.json was not found` | Wrong file name or location, or the dev server needs restarting after you add the file. |
| `Invalid VITE_MISSION_DATA_SOURCE "…"` | Use `mock` or `official`. |
| `is_mock: data is marked as mock … loaded as official` | You copied the mock file. Use the real T1.1 file. |
| `MissionDataValidationError` with `required field is missing` | The data is incomplete (ask T1.1), or the schema differs (Scenario B). |
