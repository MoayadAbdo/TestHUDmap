import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurn, turnServers } from '../turn.js';

function page(search) {
  const store = new Map();
  const page = {
    location: { pathname: '/hud/', search, hash: '' },
    history: { state: null, replaceState(state, title, url) { page.url = url; } },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    store,
  };
  return page;
}

test('reads url|user|password', () => {
  assert.deepEqual(parseTurn('turns:relay.example:443?transport=tcp|alice|pa|ss'),
    { urls: 'turns:relay.example:443?transport=tcp', username: 'alice', credential: 'pa|ss' });
  assert.equal(parseTurn('stun:stun.example:3478|a|b'), null);
  assert.equal(parseTurn('turn:relay.example:3478|alice'), null);
});

test('several ?turn=, saved, and taken out of the address bar', () => {
  const p = page('?mode=sim&turn=turns:a.example:443?transport=tcp|u1|p1&turn=turn:b.example:3478|u2|p2&room=AB12');
  const servers = turnServers(p);
  assert.deepEqual(servers.map((s) => s.urls), ['turns:a.example:443?transport=tcp', 'turn:b.example:3478']);
  assert.equal(p.url, '/hud/?mode=sim&room=AB12');
  const next = { ...page(''), storage: p.storage };
  assert.deepEqual(turnServers(next), servers);
});

test('no ?turn= and nothing saved: none', () => {
  const p = page('?mode=sim');
  assert.deepEqual(turnServers(p), []);
  assert.equal(p.url, undefined);
});

test('?turn=off forgets them; bad saved data is ignored', () => {
  const p = page('?turn=turn:a.example:3478|u|p');
  turnServers(p);
  assert.deepEqual(turnServers({ ...page('?turn=off'), storage: p.storage }), []);
  assert.deepEqual(turnServers({ ...page(''), storage: p.storage }), []);
  p.store.set('marswalk.turn', '{not json');
  assert.deepEqual(turnServers({ ...page(''), storage: p.storage }), []);
});
