/** Hidden buttons to fire every alert and move through the walk during a demo. Long-press the screen to show it. */
import { vrSettings, saveVrSettings } from './vr-layout.js';

export function createDemoPanel({ element, app, renderer, live, layers }) {
  const tune = (key, step) => () => { vrSettings[key] += step; saveVrSettings(); dispatchEvent(new Event('resize')); app.notify?.(`VR eye size ${vrSettings.size.toFixed(2)} · spacing ${vrSettings.spacing.toFixed(2)}`); };
  const actions = [
    ['Oxygen ×20', () => app.demo.oxygenFast()],
    ['Oxygen 25%', () => app.demo.oxygenLow()],
    ['Steep ground', () => app.demo.steepGround()],
    ['Solar storm', () => app.demo.solarStorm()],
    ['O₂ leak', () => app.demo.o2Leak()],
    ['Visor: focus / all panels', () => app.demo.toggleDetail()],
    ['Next stop (sim)', () => app.demo.nextStop()],
    ['Stop card: close / show', () => app.toggleCard?.()],
    ['Next map layer (3D)', () => layers?.next()],
    ['Set base here (field)', () => app.notify?.(app.demo.setBaseHere() ? 'Setting base here…' : 'Base: field mode with GPS only')],
    ['Ground Control message', () => (live.pushMessage ? live.pushMessage('Copy, looking good. Keep to the route.') : app.demo.message('Test message'))],
    ['VR / hand-held', () => renderer.setView(renderer.view === 'vr' ? 'single' : 'vr')],
    ['Eyes smaller', tune('size', -0.02)],
    ['Eyes bigger', tune('size', 0.02)],
    ['Eyes closer', tune('spacing', -0.02)],
    ['Eyes apart', tune('spacing', 0.02)],
    ['Hide', () => { element.hidden = true; }],
  ];
  element.replaceChildren(...actions.map(([label, run]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      run();
    });
    return button;
  }));
  return {
    toggle() {
      element.hidden = !element.hidden;
    },
    show() {
      element.hidden = false;
    },
  };
}
