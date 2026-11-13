// "Drive (WASD)": the laptop keyboard moves the astronaut on the 3D Mars (sim mode), for testing in a VR box
// while sitting down. Sends about 8 times a second while a key is held; the phone stops if they stop coming.
import { isMove, keyVector } from "../hud/js/move-input.js";

export const SEND_MS = 125;
const isTyping = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
const moving = (v) => v.forward || v.right || v.turn;

export function createDrive({ win = window, send, timers = globalThis, getSpeed = () => 3 }) {
  const pressed = new Set();
  let on = false, timer = null, wasMoving = false;

  function tick() {
    const v = keyVector(pressed);
    if (moving(v) || wasMoving) send({ type: "move", ...v, boost: getSpeed() });   // one last "still" when you let go
    wasMoving = !!moving(v);
  }
  win.addEventListener("keydown", (e) => {
    if (!on || !isMove(e.code) || isTyping(e.target)) return;
    e.preventDefault();
    pressed.add(e.code);
  });
  win.addEventListener("keyup", (e) => pressed.delete(e.code));
  win.addEventListener("blur", () => pressed.clear());

  return {
    setOn(next) {
      on = !!next;
      pressed.clear();
      timers.clearInterval(timer);
      timer = on ? timers.setInterval(tick, SEND_MS) : null;
      if (!on && wasMoving) { send({ type: "move", forward: 0, right: 0, turn: 0, run: false }); wasMoving = false; }
    },
    get on() { return on; },
  };
}
