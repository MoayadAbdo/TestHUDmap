// One status pill for the link instead of three: "Linked · laptop link" / "Linked · room 55CAGR",
// or the most useful problem while not linked. current() says which link brings phone data now.
export function createStatusPill(el, { current }) {
  const state = {};
  function render() {
    const via = current();
    if (via === "local") return show("● Linked · laptop link", "on");
    if (via === "peer") return show(`● Linked · room ${state.room ?? ""}`.trim(), "on");
    const why = state.link ?? state.local ?? { text: "not connected", kind: "off" };
    show(why.text, why.kind);
  }
  function show(text, kind) { el.textContent = text; el.title = text; el.className = `pill ${kind}`; }   // title: the full text when it is cut
  return {
    /** id: "link" (room code) or "local" (laptop server). */
    set(id, text, kind) { state[id] = { text, kind }; render(); },
    setRoom(room) { state.room = room; render(); },
    render,
  };
}
