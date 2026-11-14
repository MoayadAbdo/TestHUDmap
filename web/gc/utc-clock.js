// Earth time (UTC) in the header, like a mission clock. now is passed in so it can be tested.
export function utcText(date) { return date.toISOString().slice(11, 19); }

export function startUtcClock(el, now = () => new Date()) {
  const value = el?.querySelector("b");
  if (!value) return () => {};
  const tick = () => { value.textContent = utcText(now()); };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

if (typeof document !== "undefined") startUtcClock(document.getElementById("utc"));
