# Phone HUD (T1.4)

The astronaut's screen: arrow to the next stop, stop cards, oxygen, alerts, voice and live link.
Plain HTML, CSS and JavaScript modules. No build step.

## What's on the visor
- **Ground arrows and a stop pin** (like Pokémon GO): chevrons on the ground lead to a glowing pin over the next stop. If the stop is off to the side, a turn hint shows instead.
- **Compass strip** with a diamond for the next stop.
- **Mini-map** that turns with you: Curiosity's route, the stops, base, and you in the middle.
- **Location**: temperature and pressure (Curiosity REMS), Mars local time and sol at Gale crater, Earth time.
- **Suit**: oxygen time left, power, radiation (RAD average) and dose.
- **Biosigns**: heart and breathing rates. These are **simulated** from walking speed, slope and oxygen.
- **Comms**: link state and the real Earth–Mars message delay right now (checked against JPL Horizons).
- **Suit integrity**: life support turns red on low oxygen, legs turn yellow on steep ground.

## Run it on a laptop
```sh
cd hud
python3 -m http.server 8765 --bind 127.0.0.1
```
Open `http://127.0.0.1:8765/?mode=sim&demo=1` and press **Start the walk**.

## Run it on the phone
Camera, GPS and compass need HTTPS, so test on the deployed site: `https://<project>.web.app/hud/`.
Use Android Chrome.

## Screen controls
- **Tap** (or the Cardboard lever): talk to the voice agent (sim mode: start / stop walking).
- **Bluetooth clicker**: talk to the voice agent. It must send keys (Enter, arrows, Page Down, Play/Pause).
  Cheap selfie remotes send volume keys, which phone browsers usually keep: test yours first.
- **"Hey suit"** (real voice agent only): hands-free talk. Plain "suit" does not wake it.
- **Move without walking (sim mode)**, for testing in the VR box while sitting:
  - Bluetooth keyboard on the phone: **W/S** walk forward/back, **A/D** sideways, **Q/E** or **←/→** turn, **Shift** runs, **T** auto-walk on/off, **C** close / reopen the stop card.
    (In sim mode Space, Enter, Page Down and V talk to the AI; the arrows move you.)
  - Gamepad on the phone: left stick walks, right stick turns, shoulder buttons run, **A** talks, **B** auto-walk, **Y** stop card.
  - From the laptop: Ground Control → **Drive (WASD)** switch, same keys, with its own speed (3× by default). The phone stops if the link drops.
  - Too slow? Hold **Shift** to run (2.5×), or add `&speed=3` to the HUD link (3× for all walking).
- **Long-press** (about 1 second): show or hide the demo panel. It can speed up oxygen, set it to 25%,
  fake steep ground, jump to the next stop (sim), set the base here (field), send a Ground Control message,
  and switch VR/hand-held.

## Link options
| Option | Meaning |
|---|---|
| `mode=field` or `mode=sim` | Pre-select the mode |
| `view=vr` or `view=single` | Two eyes or one view |
| `demo=1` | Show the demo panel at start |
| `live=fake`, `voice=fake`, `sim=fake` | Force a stand-in even if the real part is deployed |
| `mission=<url>` | Use another mission file |
| `speed=5` | Stand-in sim walks 5 times faster |

## Tests
```sh
cd hud
node --test tests/
```
The tests cover the maths: Mars time and Curiosity sol numbers, Earth–Mars light time, ground arrow positions, distances, the Mars-to-desert mapping (including rotation and scale), arrival after
3 seconds inside 20 m, oxygen, every alert, the camera heading, and the status shape for the voice agent.

## How the arrow stays right
Navigation runs in the same frame as the heading. In field mode the stops are turned into desert GPS points
once at the start, so the Earth compass and the stop bearings match even when the twin map is rotated.
In sim mode everything runs on Mars.

See `CONTRACTS.md` for what the HUD needs from the other tasks.

## Integration notes (merged into the repo)
- Lives in `web/hud/`; the site root is `web/`, so paths in `js/config.js` are `/mission/mission.json`, `/ai/voice.js`, `/sim/sim.js`, `/live/live.js`.
- **Sim mode uses T1.3's 3D sim** (`/sim/sim.js`): `js/sources/sim-source.js` starts it in an off-screen layer (one eye's shape, 62° view to match the ground arrows) and draws it behind the HUD. The astronaut walks by themselves along the route.
- Motion access is asked in both modes (iPhone needs it inside the tap).
- The official `mission.json` lists the base as stop 0 with `"is_base": true`; `js/app.js` drops it (the base is `anchor.mars`).
- `/live/live.js` (T1.5) is not built yet, so the HUD uses the stand-in in `dev/fake-live.js`.
- Tests: `npm test` (33 pass).

## Mars walk mode (real GPS + 3D Mars)
Choose **Mars walk** on the start screen. You walk for real; GPS moves you on the 3D Mars (T1.3) and the compass turns your view. No touching needed: stop cards appear on arrival, the Bluetooth clicker talks to the AI.
- Fit the Mars route to your space: `/hud/?scale=0.3` (desert metres per Mars metre; 0.3 ≈ 230 m of walking for the 750 m route), `&rotation=90` to turn it.
- Test at a desk: `/hud/?mode=marswalk&fakegps=1` (pretend GPS walking at 1.2 m/s).
- Safety: inside the VR box you can't see the real ground. Walk slowly on flat open ground, **with a spotter**.
