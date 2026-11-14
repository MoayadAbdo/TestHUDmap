import { eyeRects } from '../view/vr-layout.js';
/** Mars walk: you walk for real (GPS + compass) and see T1.3's 3D Mars instead of the camera. */
export function createMarsWalkSource(field, sim, mission, view = 'single', assetsBase = '../mission/') {
  return {
    frame: 'field',
    async start() {
      const box = document.createElement('div');
      const fit = () => {                      // same shape as one eye window, so nothing is stretched
        const [e] = eyeRects(innerWidth, innerHeight, view);
        box.style.cssText = `position:fixed;top:0;left:0;width:${e.w}px;height:${e.h}px;z-index:-1;pointer-events:none`;
      };
      fit();
      addEventListener('resize', () => { fit(); dispatchEvent(new Event('sim-resize')); });
      document.body.appendChild(box);
      await sim.start?.(mission, { container: box, assetsBase, stereo: false, autopilot: false, hud: true, hfovDeg: 62, lockPitch: false });
      // GPS + compass start right away; the camera (only used for Ground Control photos) must not block the walk
      field.start().catch((e) => console.warn('[marswalk] camera unavailable:', e?.message ?? e));
    },
    stop() {
      field.stop();
      sim.stop?.();
    },
    getPosition: () => field.getPosition(),
    jumpTo: (...a) => field.jumpTo?.(...a),                    // "Next stop" (camera / Mars walk driver)
    getBackground: () => sim.getBackground(),
    capturePhoto: (...a) => field.capturePhoto(...a),          // Ground Control still sees the real camera
    get gpsError() { return field.gpsError; },
    world3d: sim,
  };
}
