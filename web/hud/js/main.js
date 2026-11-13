import { asLive, asSim, asVoice } from './adapters.js';
import { createHudApp } from './app.js';
import { config } from './config.js';
import { createFieldSource, requestMotionPermission } from './sources/field-source.js';
import { createSimSource } from './sources/sim-source.js';
import { createMarsWalkSource } from './sources/marswalk-source.js';
import { SIM_CLICKER_KEYS, bindInput } from './input.js';
import { createMoveInput } from './move-input.js';
import { createLayerSwitch } from './layer-switch.js';
import { startWakeWord } from './wake-word.js';
import { createDemoPanel } from './view/demo-panel.js';
import { createRenderer } from './view/renderer.js';
import { createFakeLive } from '../dev/fake-live.js';
import { createFakeSim } from '../dev/fake-sim.js';
import { createFakeVoice } from '../dev/fake-voice.js';

const params = new URLSearchParams(location.search);
const fromPage = (path) => new URL(path, document.baseURI).href;
const startScreen = document.getElementById('start');
const startError = document.getElementById('startError');

async function loadMission() {
  for (const url of [params.get('mission') ?? config.mission, config.sampleMission]) {
    try {
      const response = await fetch(fromPage(url), { cache: 'no-store' });
      if (response.ok) {
        const mission = await response.json();
        // photos and 3D assets are relative to mission.json
        const assetsBase = new URL('./', response.url).href;
        for (const s of mission.stops) if (s.photo) s.photo = new URL(s.photo, assetsBase).href;
        // fit the Mars route to the space you have: ?scale=0.3 (desert metres per Mars metre), ?rotation=90
        if (params.has('scale')) mission.anchor.scale = Number(params.get('scale'));
        if (params.has('rotation')) mission.anchor.rotation_deg = Number(params.get('rotation'));
        return { mission, url, assetsBase };
      }
    } catch {
      // try the next one
    }
  }
  throw new Error('No mission.json found.');
}

/** Loads a teammate's module if it is there and fits; otherwise uses the stand-in. */
async function loadPart(name, fit, standIn) {
  if (params.get(name) !== 'fake') {
    try {
      const part = fit(await import(fromPage(config[name])));
      if (part) return { part, real: true };
    } catch {
      // not deployed yet
    }
  }
  return { part: standIn(), real: false };
}

let wakeLock = null;
async function keepScreenOn() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    // not supported or not allowed; the walk still works
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock?.released !== false) keepScreenOn();
});

async function enterFullscreen(view) {
  try {
    await document.documentElement.requestFullscreen?.();
    if (view === 'vr') await screen.orientation?.lock?.('landscape');
  } catch {
    // fine on desktops and some browsers
  }
}

async function start(mode, view, motionAsked) {
  if (params.get('fakegps') === '1') {
    const { installFakeGps } = await import('../dev/fake-gps.js');
    installFakeGps({ lat: Number(params.get('lat') ?? 31.95), lon: Number(params.get('lon') ?? 35.91) });
  }
  const { mission, url, assetsBase } = await loadMission();
  let app = null;
  const getStatus = () => app?.getStatus();

  const live = await loadPart('live', asLive, () => createFakeLive());
  const voice = await loadPart('voice', asVoice, () => createFakeVoice({ getStatus }));
  let source;
  if (mode === 'sim') {
    const sim = await loadPart('sim', asSim, () => createFakeSim({ mission, speedFactor: Number(params.get('speed') ?? 1) }));
    source = createSimSource(sim.part, mission, view, assetsBase, Number(params.get('speed') ?? 1));   // ?speed=3: walk faster for testing
  } else if (mode === 'marswalk') {
    const sim = await loadPart('sim', asSim, () => null);
    source = sim.real ? createMarsWalkSource(createFieldSource(), sim.part, mission, view, assetsBase) : createFieldSource();
  } else {
    source = createFieldSource();
  }

  if (params.get('autostart') !== '1') await enterFullscreen(view);
  await keepScreenOn();
  if (!(await motionAsked)) console.warn('[hud] motion access refused: using walking direction instead of the compass');
  await source.start();

  const link = live.real
    ? { get label() { return live.part.linkLabel?.() ?? 'Habitat link'; }, bars: 4 }
    : { label: 'Local only (stand-in)', bars: 1 };
  app = createHudApp({ mission, source, live: live.part, voice: voice.part, link });
  const canvas = document.getElementById('hud');
  const layerSwitch = createLayerSwitch({ sim: source.world3d ?? source.sim, notify: (t) => app.notify(t) });
  const getFrame = () => { const f = app.frame(); f.hud.layer = layerSwitch.current; return f; };
  const renderer = createRenderer({ canvas, getFrame, view });
  const demo = createDemoPanel({ element: document.getElementById('demo'), app, renderer, live: live.part, layers: layerSwitch });
  if (params.get('demo') === '1') demo.show();
  renderer.preload(mission.stops.map((s) => s.photo).filter(Boolean));

  // Sim mode: a tap (or the Cardboard button) starts / stops walking; the Bluetooth clicker talks to the AI.
  // Field mode: you walk for real, so a tap talks to the AI.
  const sim3d = mode === 'sim' && typeof source.sim?.setAutopilot === 'function' ? source.sim : null;
  const toggleWalk = () => {
    const walking = !sim3d.isAutopilot();
    sim3d.setAutopilot(walking);
    app.notify(walking ? 'Walking: tap to stop' : 'Stopped: tap to walk');
  };
  bindInput({ canvas, onTap: sim3d ? toggleWalk : app.onTap, onLongPress: demo.toggle, onClicker: app.onTap, onCard: app.toggleCard, onLayer: layerSwitch.next,
    clickerKeys: sim3d ? SIM_CLICKER_KEYS : undefined });
  // Sim mode: move without walking for real (WASD, gamepad, or Ground Control driving)
  const moveInput = sim3d?.setMoveInput ? createMoveInput({ sim: sim3d, onVoice: app.onTap, onToggleWalk: toggleWalk, onCard: app.toggleCard, onLayer: layerSwitch.next }) : null;
  // Mars walk: every frame, put the 3D Mars view where the real GPS puts you
  if (source.world3d) {
    const follow = () => {
      const m = app.marsPosition();
      if (m) source.world3d.setExternalPosition(m.mars, m.heading, m.pitch);
      requestAnimationFrame(follow);
    };
    follow();
  }

  window.hud = {
    getStatus: app.getStatus, demo: app.demo, standInLive: live.real ? null : live.part, sim: source.world3d ?? source.sim ?? null,
    move: (v) => moveInput?.remote(v),
    layer: (id) => (id ? layerSwitch.set(id) : layerSwitch.next()),   // Ground Control picks the visor's layer
  };
  console.info('[hud] mission', url, 'live', live.real ? 'real' : 'stand-in', 'voice', voice.real ? 'real' : 'stand-in');
  await Promise.race([document.fonts?.load?.('600 20px Rajdhani'), new Promise((resolve) => setTimeout(resolve, 1500))]);
  app.start();
  if (sim3d) app.notify(moveInput ? 'Move: WASD / gamepad, or tap to auto-walk' : 'Tap the screen to start walking');
  if (source.world3d) app.notify('Walk for real: GPS moves you on Mars');
  // hands-free voice: "Hey suit" (only with the real voice agent, and unless ?wake=0)
  if (voice.real && params.get('wake') !== '0') setTimeout(() => startWakeWord({ voice: voice.part, notify: app.notify }), 4000);
  renderer.start();
  startScreen.hidden = true;
}

function chosen(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

document.getElementById('go').addEventListener('click', () => {
  startError.textContent = '';
  const mode = chosen('mode');
  const motionAsked = requestMotionPermission();
  // ask for the microphone inside the tap, so "Hey suit" works later without touching the phone
  navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
  start(mode, chosen('view'), motionAsked).catch((error) => {
    startError.textContent = error.message || String(error);
  });
});

if (params.get('mode')) document.querySelector(`input[name="mode"][value="${params.get('mode')}"]`)?.click();
if (params.get('view')) document.querySelector(`input[name="view"][value="${params.get('view')}"]`)?.click();
if (params.get('autostart') === '1') document.getElementById('go').click();
