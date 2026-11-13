import assert from "node:assert/strict";
import { test } from "node:test";
import { createPairPanel } from "../pair-panel.js";

function fakeElement(props = {}) {
  const on = {};
  return { hidden: false, value: "", textContent: "", innerHTML: "", dataset: {}, attrs: {}, focused: 0, selected: 0, ...props,
    addEventListener(type, fn) { on[type] = fn; }, fire(type, e = {}) { return on[type]?.(e); },
    setAttribute(name, value) { this.attrs[name] = value; }, focus() { this.focused++; }, select() { this.selected++; } };
}

function setup({ page = "https://moayadabdo.github.io/TestHUDmap/web/gc/", room = "", copyText = async () => {} } = {}) {
  const els = { pair: fakeElement({ hidden: true }), pairMode: fakeElement({ value: "sim" }) };
  const byId = (id) => (els[id] ??= fakeElement());
  const keys = fakeElement(), state = { room, made: 0, copied: [] };
  const panel = createPairPanel({
    byId, keys, page: () => page, currentRoom: () => state.room,
    newRoom: () => { state.made++; state.room = "NEW234"; },
    makeQr: (text) => `<svg data-for="${text}"></svg>`,
    copyText: (text) => { state.copied.push(text); return copyText(text); },
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
  });
  return { els, keys, state, panel };
}

test("no room yet: Pair phone makes one and shows its QR and code", () => {
  const { els, state, panel } = setup();
  els.pairOpen.fire("click");
  assert.equal(state.made, 1);
  assert.equal(panel.isOpen(), true);
  assert.equal(els.pairOpen.attrs["aria-expanded"], "true");
  assert.equal(els.pairQr.dataset.text, "https://moayadabdo.github.io/TestHUDmap/web/hud/?mode=sim&room=NEW234");
  assert.equal(els.pairQr.innerHTML, `<svg data-for="${els.pairQr.dataset.text}"></svg>`);
  assert.equal(els.pairCode.textContent, "NEW234");
  assert.equal(els.pairGcLink.value, "https://moayadabdo.github.io/TestHUDmap/web/gc/?room=NEW234");
  assert.equal(els.pairNote.hidden, true);
});

test("a joined room is used as it is", () => {
  const { els, state } = setup({ room: "K7Q2XM" });
  els.pairOpen.fire("click");
  assert.equal(state.made, 0);
  assert.equal(els.pairCode.textContent, "K7Q2XM");
});

test("Esc, Close or the button again closes it", () => {
  const { els, keys, panel } = setup({ room: "K7Q2XM" });
  els.pairOpen.fire("click");
  keys.fire("keydown", { key: "w" });
  assert.equal(panel.isOpen(), true);
  keys.fire("keydown", { key: "Escape" });
  assert.equal(panel.isOpen(), false);
  assert.equal(els.pairOpen.attrs["aria-expanded"], "false");
  els.pairOpen.fire("click"); els.pairClose.fire("click");
  assert.equal(panel.isOpen(), false);
  els.pairOpen.fire("click"); els.pairOpen.fire("click");
  assert.equal(panel.isOpen(), false);
});

test("the mode picks the HUD mode in the QR", () => {
  const { els } = setup({ room: "K7Q2XM" });
  els.pairOpen.fire("click");
  els.pairMode.value = "field";
  els.pairMode.fire("change");
  assert.match(els.pairQr.dataset.text, /\?mode=field&room=K7Q2XM$/);
});

test("refresh shows a new room while open, nothing while closed", () => {
  const { els, state, panel } = setup({ room: "K7Q2XM" });
  panel.refresh();
  assert.equal(els.pairCode.textContent, "");
  els.pairOpen.fire("click");
  state.room = "ZZ2345";
  panel.refresh();
  assert.equal(els.pairCode.textContent, "ZZ2345");
});

test("copy: the Ground Control link; if the browser says no, the link is selected", async () => {
  const ok = setup({ room: "K7Q2XM" });
  ok.els.pairOpen.fire("click");
  await ok.els.pairCopy.fire("click");
  assert.deepEqual(ok.state.copied, ["https://moayadabdo.github.io/TestHUDmap/web/gc/?room=K7Q2XM"]);
  assert.equal(ok.els.pairCopy.textContent, "Copied");

  const no = setup({ room: "K7Q2XM", copyText: () => { throw new Error("not allowed"); } });
  no.els.pairOpen.fire("click");
  await no.els.pairCopy.fire("click");
  assert.equal(no.els.pairGcLink.selected, 1);
  assert.equal(no.els.pairCopy.textContent, "Copy failed: link selected");
});

test("on localhost the panel says the phone can't open the link", () => {
  const { els } = setup({ page: "http://127.0.0.1:8771/web/gc/?room=K7Q2XM", room: "K7Q2XM" });
  els.pairOpen.fire("click");
  assert.equal(els.pairNote.hidden, false);
});
