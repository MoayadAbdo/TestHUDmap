import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLinkChoice } from '../link-choice.js';

function clock() { let t = 0; return { now: () => t, go: (ms) => { t += ms; } }; }

test('one link: its data is used', () => {
  const c = clock(), choice = createLinkChoice({ now: c.now, quietMs: 3000 });
  assert.equal(choice.current(), null);
  assert.equal(choice.accept('peer'), true);
  assert.equal(choice.current(), 'peer');
});

test('both links: local wins, PeerJS is not counted twice', () => {
  const c = clock(), choice = createLinkChoice({ now: c.now, quietMs: 3000 });
  assert.equal(choice.accept('local'), true);
  c.go(500);
  assert.equal(choice.accept('peer'), false);
  assert.equal(choice.current(), 'local');
});

test('local goes quiet: PeerJS takes over, and local takes back over when it returns', () => {
  const c = clock(), choice = createLinkChoice({ now: c.now, quietMs: 3000 });
  choice.accept('local');
  c.go(3500);
  assert.equal(choice.accept('peer'), true);
  assert.equal(choice.current(), 'peer');
  assert.equal(choice.accept('local'), true);
  assert.equal(choice.accept('peer'), false);
  assert.equal(choice.current(), 'local');
});
