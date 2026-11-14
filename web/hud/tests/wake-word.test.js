import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterWake, createWakeWord, isWakePhrase } from '../js/wake-word.js';

test('wake phrase needs "hey" (we say "suit" all through the pitch)', () => {
  for (const yes of ['hey suit', 'Hey, suit', 'okay suit what is my oxygen', 'hi suits']) assert.ok(isWakePhrase(yes), yes);
  for (const no of ['the suit is great', 'sweet', 'this suite', 'hey there']) assert.ok(!isWakePhrase(no), no);
});

/** Fake clock + timers: advance(ms) runs everything due. */
function fakeTime() {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  const timers = {
    setTimeout: (fn, ms) => { jobs.set(++id, { fn, at: now + ms }); return id; },
    setInterval: (fn, ms) => { jobs.set(++id, { fn, at: now + ms, every: ms }); return id; },
    clearInterval: (i) => jobs.delete(i),
    clearTimeout: (i) => jobs.delete(i),
  };
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...jobs.entries()].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [key, job] = due;
      now = job.at;
      if (job.every) job.at += job.every; else jobs.delete(key);
      job.fn();
    }
    now = end;
  }
  return { timers, clock: () => now, advance };
}

/** Fake speech recognition: remembers every instance so a test can "speak". */
function fakeSR() {
  const made = [];
  class SR {
    constructor() { made.push(this); this.started = false; }
    start() { this.started = true; }
    abort() { this.started = false; queueMicrotask(() => this.onend?.()); }
    say(text, final = false) { const r = [{ transcript: text }]; r.isFinal = final; this.onresult({ resultIndex: 0, results: [r] }); }
    end() { this.started = false; this.onend(); }
    fail(error) { this.onerror({ error }); this.started = false; this.onend(); }
  }
  return { SR, made };
}

function fakeVoice() {
  const v = { state: 'disconnected', toggles: 0, text: [], user: [], asked: [] };
  v.toggle = () => { v.toggles += 1; };
  v.ask = (q) => v.asked.push(q);
  v.onText = (cb) => v.text.push(cb);
  v.onUserText = (cb) => v.user.push(cb);
  return v;
}

test('waits while the agent is connecting instead of giving up after 4 s', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const voice = fakeVoice();
  const w = createWakeWord({ voice, SR, timers: time.timers, clock: time.clock });
  w.start();
  made[0].say('hey suit');
  time.advance(900);
  assert.equal(voice.toggles, 0, 'waits for a question, then for the microphone to be released');
  time.advance(100);
  assert.equal(voice.toggles, 1, 'opens the AI 1 s after a lone "Hey suit"');
  assert.deepEqual(voice.asked, []);
  voice.state = 'connecting';
  time.advance(10_000);
  await Promise.resolve();
  assert.equal(w.mode, 'waking');
  assert.equal(made.length, 1, 'no second listener while connecting');
  voice.state = 'connected';
  time.advance(1000);
  assert.equal(w.mode, 'talking');
});

test('closes an idle session, but the astronaut talking counts as activity', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const voice = fakeVoice();
  const w = createWakeWord({ voice, SR, timers: time.timers, clock: time.clock, idleMs: 15_000 });
  w.start();
  made[0].say('hey suit');
  time.advance(1000);
  voice.state = 'connected';
  time.advance(9000);
  voice.user.forEach((cb) => cb('how much oxygen do I have'));
  time.advance(10_000);
  assert.equal(voice.toggles, 1, 'still open: the user spoke 10 s ago');
  time.advance(6000);
  assert.equal(voice.toggles, 2, 'closed after 15 s of quiet');
  voice.state = 'disconnected';
  time.advance(1000);
  await Promise.resolve();
  assert.equal(w.mode, 'idle');
  assert.equal(made.length, 2, 'listening for the wake word again');
});

test('no internet: backs off and says so once', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const notes = [];
  const w = createWakeWord({ voice: fakeVoice(), SR, timers: time.timers, clock: time.clock, notify: (t) => notes.push(t) });
  w.start();
  made[0].fail('network');
  time.advance(1000);
  assert.equal(made.length, 1, 'no restart after 300 ms when offline');
  time.advance(1500);
  assert.equal(made.length, 2);
  made[1].fail('network');
  time.advance(5000);
  assert.equal(made.length, 3);
  assert.equal(notes.filter((n) => n.includes('offline')).length, 1);
  w.stop();
});

test('a session opened with the clicker pauses the wake word', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const voice = fakeVoice();
  const w = createWakeWord({ voice, SR, timers: time.timers, clock: time.clock });
  w.start();
  voice.state = 'connected';
  time.advance(1000);
  await Promise.resolve();
  assert.equal(w.mode, 'talking');
  assert.equal(made[0].started, false);
});

test('the words after "Hey suit" are found', () => {
  assert.equal(afterWake("Hey suit, what's here?"), "what's here?");
  assert.equal(afterWake('okay suit'), '');
  assert.equal(afterWake('so hey suit how much oxygen do I have'), 'how much oxygen do I have');
});

test('"Hey suit, what\'s here?" in one breath: the question goes to the agent, no need to ask again', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const voice = fakeVoice();
  const w = createWakeWord({ voice, SR, timers: time.timers, clock: time.clock });
  w.start();
  made[0].say('hey suit');
  time.advance(400);
  made[0].say('hey suit what');
  time.advance(400);
  assert.deepEqual(voice.asked, [], 'still talking: keeps listening');
  made[0].say("hey suit what's here", true);
  assert.deepEqual(voice.asked, ["what's here"], 'sent the moment the sentence is done');
  time.advance(300);
  assert.equal(voice.toggles, 1);
  voice.state = 'connected';
  time.advance(1000);
  assert.equal(w.mode, 'talking');
});

test('the phone stops listening after "Hey suit": the AI opens anyway', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const voice = fakeVoice();
  const w = createWakeWord({ voice, SR, timers: time.timers, clock: time.clock });
  w.start();
  made[0].say('hey suit');
  made[0].end();
  time.advance(300);
  assert.equal(voice.toggles, 1);
  assert.equal(w.mode, 'waking');
});

test('a long question still opens the AI (6 s at most)', async () => {
  const time = fakeTime();
  const { SR, made } = fakeSR();
  const voice = fakeVoice();
  const w = createWakeWord({ voice, SR, timers: time.timers, clock: time.clock });
  w.start();
  made[0].say('hey suit');
  for (let i = 0; i < 12; i++) { time.advance(500); made[0].say(`hey suit tell me ${'more '.repeat(i + 1)}`); }
  time.advance(300);
  assert.equal(voice.toggles, 1);
  assert.equal(voice.asked.length, 1);
  assert.equal(w.mode, 'waking', 'did not give up while hearing the question');
});
