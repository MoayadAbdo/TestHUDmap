# MarStep — our own metric

**MarStep** puts a price on every step on Mars, in joules. From that one price the HUD works out how much oxygen it takes to get home, and from that, a whole set of answers the astronaut and Ground Control need.

Code: `web/hud/js/core/energy.js` (the model) and `web/hud/js/core/marstep.js` (everything read off it). Tests: `web/hud/tests/energy.test.js`, `web/hud/tests/marstep.test.js`, `web/gc/tests/marstep-readout.test.js`.

## The idea in one line

Think of the astronaut as a car and oxygen as the fuel. Uphill, loose sand and bumpy rock burn fuel faster. MarStep keeps asking: **do I still have enough fuel to drive home, with some left over?**

## The formula, in simple words

**1. How hard am I working right now? (watts)**

```
P = P_stand + η · (P0 − P_stand) · v / v0  +  m · g · v · sinθ / ε
```

It adds three costs:

- **Standing (150 W):** just being alive inside a heavy pressurised suit. You pay this even standing still.
- **Walking (+122 W at 0.8 m/s):** more if you walk faster, and more on bad ground. **η** is the "bad ground" factor: 1 on firm smooth ground, up to 1.9 on loose, bumpy ground.
- **Climbing:** lifting yourself plus the suit (180 kg) against Mars gravity (3.71 m/s²). Muscles are only about 25 % efficient at this (ε), so 1 W of lifting costs about 4 W. Going downhill gives nothing back: braking costs a little too.

| Ground (at 0.8 m/s) | Power |
|---|---|
| Flat, firm | 272 W |
| Flat, loose and bumpy (η 1.9) | 382 W |
| 10° downhill | 349 W |
| 10° uphill | 643 W |
| 20° uphill | 1,003 W |

**2. Where η comes from — NASA data, not guesses**

```
η = 1 + 0.5 · clip((420 − TI) / 70) + 0.4 · clip(rough / 0.5 m)
```

- **TI** is THEMIS thermal inertia (Mars Odyssey). Low TI means loose ground → up to +0.5.
- **rough** is how bumpy the HiRISE 1 m height map is → up to +0.4.

**3. Energy to get home**

The HUD checks every way back to base on the 1 m height map and keeps the one that costs the **least energy** (Dijkstra), not the shortest one. A long flat way can beat a short steep one. Ground over 20° is blocked.

**4. Energy → oxygen**

Your body burns oxygen to make energy: **1 litre of O₂ ≈ 20.1 kJ**. The tank drains faster when you work harder (rate × P / 272 W).

**5. The MarStep margin**

```
MarStep ×n = O₂ left / (O₂ to walk home + 10 min reserve)
```

| Margin | Battery | Meaning |
|---|---|---|
| ×1.5 and up | yellow | fine |
| ×1 – ×1.5 | orange, HOME SOON | start thinking about going back |
| under ×1 | red, HEAD HOME | the suit sends you home |

## What else MarStep tells us (no new sensors)

All of these come from the same numbers: the power right now, the energy home, and the oxygen left.

| Answer | How it's worked out | Where it shows |
|---|---|---|
| **Turn-back clock** | spare oxygen ÷ how fast you're burning it now | visor ("turn back 1h 38m"), Ground Control |
| **Linger time** | the same, but standing still (150 W) — how long you can work at a stop | Ground Control |
| **Reach** | spare energy ÷ (2 × cost per metre here): how much further you can go out *and* come back | visor ("+1.2 km"), Ground Control |
| **Effort zone** | watts vs the NASA suit's design rates: REST < 200 W, STEADY ≤ 293 W (design average), HARD ≤ 469 W, PEAK above the 469 W design peak | visor (HARD / PEAK), Ground Control |
| **Time over peak** | minutes above 469 W; the suit's cooling is only designed for 15 min at peak | Ground Control |
| **Next stop: GO / TIGHT / SKIP** | the margin you'll have when you arrive at the next stop (walk there + walk home from there) | next-stop plate ("×2.1 THERE" or "SKIP, O₂ SHORT"), Ground Control |
| **Terrain tax** | how much more the way home costs than the same walk on flat firm ground (+27 %) | Ground Control |
| **Used this walk** | O₂ litres; CO₂ made (× 0.85); kcal burned; cooling water (70 % of the heat leaves by sublimating ice, 2.84 MJ per kg) | Ground Control |

All of them also go to Ground Control in the telemetry (`marstep` object) and in the HUD status: `turn_back_min`, `reach_m`, `effort_zone`, `next_stop_call`, `next_stop_margin`.

## Where the numbers come from

- **P0 = 272 W:** the average metabolic rate across all Apollo lunar surface EVAs, 234 kcal/h (NASA NTRS 19910001262).
- **η range:** the Pandolf walking-cost model's terrain factors (1.0 road … 2.1 loose sand).
- **ε 25 % up, ÷1.2 down:** the classic Margaria values for positive and negative muscle work.
- **20.1 kJ per litre O₂, RQ 0.85:** standard values for a normal mixed diet.
- **293 W / 469 W suit design rates, 60–80 % of heat to the water loop:** NASA EMU thermal model (NASA NTRS 20000081742).

## Honest limits (say these before the judges do)

- **P0 is a Moon number used on Mars.** Mars gravity (0.38 g) is higher than the Moon's (0.17 g), so real walking may cost a bit more. Read the margin as an estimate.
- **The turn-back clock assumes you stay about this far from base.** Walking further out makes home cost more, so while heading out the real time is a bit shorter. The margin itself always uses the real energy home from where you stand.
- **The next-stop check is an estimate:** average ground along the planned path plus any net climb, not a full route search.
- **Nobody has walked on Mars yet,** so no Mars model is validated. MarStep is Apollo-calibrated, terrain-aware, and careful where it matters (downhill never gives energy back).

## Pitch line

> "We built our own metric, **MarStep**. It prices every step on Mars from NASA terrain data, turns that into oxygen, and keeps asking one question: can you still get home? From that one number the suit knows when to turn back, how far you can still go, and whether the next stop is worth it."
