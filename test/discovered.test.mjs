// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The Discovered panel (ROAD-3491): identity is MAC / serial, never IP; live state
// shown as it is; no bus → the reason, never an invented list.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { thingRow, thingIdentity, showDiscovered } from '../js/discoveredPanel.js';

const CONFIG = JSON.parse(fs.readFileSync(new URL('../config/discovered.json', import.meta.url), 'utf8'));

const things = [
  { id: 'a', mac: '00:07:f5:42:06:a2', serial: 'SN1', name: 'Unit A', ips: ['10.0.0.9'], vendor: 'Maker', model: 'M1', kinds: ['nmos'], live: { state: 'good', why: 'nmos: seen 12s ago' } },
  { id: 'b', serial: 'SN2', name: 'Unit B', ips: ['10.0.0.10', '10.0.1.10'], kinds: ['mdns'], live: { state: 'dead', why: 'mdns: lost' } },
  { id: 'c', agent: 'bench-pi', name: '', ips: [], live: { state: 'kinda', why: 'seen on the network, never verified' } },
];

test('the discovery kinds are tunables in config/discovered.json', () => {
  assert.ok(Array.isArray(CONFIG.kinds));
  CONFIG.kinds.forEach((k) => assert.equal(typeof k, 'string'));
});

test('identity is MAC, else serial, else agent — never an IP', () => {
  assert.equal(thingIdentity(things[0]), '00:07:f5:42:06:a2');
  assert.equal(thingIdentity(things[1]), 'SN2');
  assert.equal(thingIdentity(things[2]), 'bench-pi');
  assert.equal(thingIdentity({ ips: ['10.0.0.1'] }), '');
  const rows = things.map(thingRow);
  rows.forEach((r) => assert.doesNotMatch(r.identity, /^\d+\.\d+\.\d+\.\d+$/));
  assert.equal(rows[1].ips, '10.0.0.10, 10.0.1.10');
  assert.deepEqual(rows.map((r) => r.state), ['good', 'dead', 'kinda']);
  assert.equal(rows[1].why, 'mdns: lost');
});

function stubDom() {
  const mk = (tag) => ({
    tagName: tag, attrs: {}, children: [], textContent: '', listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(t, fn) { this.listeners[t] = fn; },
  });
  const doc = { createElement: mk };
  const host = { ownerDocument: doc };
  return { doc, host, status: mk('div') };
}

test('no bus: the reason goes on screen and nothing is listed', async () => {
  const { host, status } = stubDom();
  const made = [];
  const T = { create: (h, o) => { const t = { o, rows: null, setRows(r) { this.rows = r; } }; made.push(t); return t; } };
  const S = { TRUST_MINUTES: 5, discovered: async () => ({ ok: false, reason: 'No broker reachable from this page.', things: () => [], stop() {} }) };
  const d = await showDiscovered(host, { S, T, statusEl: status, kinds: CONFIG.kinds, tableId: 'test-discovered' });
  assert.equal(d.ok, false);
  assert.equal(status.textContent, 'No broker reachable from this page.');
  assert.equal(status.attrs['data-apk-state'], 'dead');
  assert.equal(made[0].o.id, 'test-discovered');
  assert.equal(made[0].rows, null);
});

test('with a bus: one APKTable row per thing, kinds passed through, live state as a badge', async () => {
  const { host, status } = stubDom();
  let table;
  const T = { create: (h, o) => (table = { o, rows: [], setRows(r) { this.rows = r; } }) };
  let asked;
  const S = { TRUST_MINUTES: 5, discovered: async (o) => { asked = o; return { ok: true, reason: '', things: () => things, stop() {} }; } };
  const picked = [];
  await showDiscovered(host, { S, T, statusEl: status, kinds: CONFIG.kinds, tableId: 'test-discovered', onPick: (t) => picked.push(t) });
  assert.deepEqual(asked.kinds, CONFIG.kinds);
  assert.equal(table.rows.length, 3);
  assert.equal(status.attrs['data-apk-state'], 'good');
  const live = table.o.columns.find((c) => c.key === 'state');
  const badge = live.render('dead', table.rows[1], 1);
  assert.equal(badge.attrs['data-apk-state'], 'dead');
  assert.equal(badge.textContent, 'dead');
  const pick = table.o.columns.find((c) => c.key === 'pick');
  pick.render('', table.rows[0], 0).listeners.click();
  assert.equal(picked[0], things[0]);
  asked.onChange([things[0]]);
  assert.equal(table.rows.length, 1, 'onChange redraws');
});
