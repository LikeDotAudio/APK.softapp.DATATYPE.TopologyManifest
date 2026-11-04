// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The manifest block round trip over cad.like.audio/host@1 (ROAD-3491), with the
// app's vendored APKSoftapp client in a stub window; discovered things by identity.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TopologyModel } from '../js/topologyModel.js';
import { connectTopologyHost, EDITOR, BLOCK_TYPE } from '../js/topologyHost.js';

const require = createRequire(import.meta.url);
const { world, hostContract } = require('./host-world.cjs');

test('load → edit → request: the CAD gets the edited block back, at our origin, on host@1', async () => {
  const w = world();
  const state = { model: new TopologyModel() };
  const loaded = [];
  const host = connectTopologyHost(w.S, state, { onLoaded: (m, meta) => loaded.push([m, meta]), notice: false });
  assert.ok(host.embedded);
  assert.deepEqual(w.toParent[0], { m: { protocol: 'cad.like.audio/host@1', type: 'editorReady', editor: EDITOR, blockType: BLOCK_TYPE }, o: w.ORIGIN });

  const block = new TopologyModel({ projectName: 'Hall B', entities: [{ id: 'dev_1', label: 'Desk', type: 'CONSOLE', mnemonic: 'C1', parent_id: 'r', room: 'FOH', ip: '' }] }).toJSON();
  w.fire({ protocol: w.S.PROTOCOL, type: 'load', block, meta: { blockName: 'TOPO_1' } });
  assert.equal(loaded.length, 1);
  assert.equal(state.model.projectName, 'Hall B');

  state.model.addDiscovered({ mac: 'b8:27:eb:00:00:01', name: 'stagebox', kinds: ['dante'], ips: ['10.0.0.5'] });
  w.fire({ protocol: w.S.PROTOCOL, type: 'request' });
  const save = w.toParent.at(-1);
  assert.equal(save.o, w.ORIGIN, 'never "*"');
  assert.equal(save.m.type, 'blockSave');
  assert.equal(save.m.meta.blockName, 'TOPO_1');
  assert.deepEqual(save.m.block.entities.map((e) => e.label), ['Desk', 'stagebox']);
  assert.deepEqual(new TopologyModel(save.m.block).toJSON(), save.m.block, 'the block survives a reload');

  const c = await hostContract();
  if (c) for (const { m } of w.toParent) assert.deepEqual(c.validateMessage(c.schema, 'toCad', m), [], m.type);
});

test('a discovered thing is one entity per identity (MAC / serial), however its IP moves', () => {
  const m = new TopologyModel({ entities: [] });
  const a = m.addDiscovered({ mac: 'b8:27:eb:00:00:01', name: 'pi', kinds: ['mdns'], ips: ['10.0.0.5'] });
  const again = m.addDiscovered({ mac: 'b8:27:eb:00:00:01', name: 'pi', kinds: ['mdns'], ips: ['10.0.0.99'] });
  assert.equal(a, again);
  assert.equal(m.entities.length, 1);
  assert.equal(a.deviceId, 'b8:27:eb:00:00:01');
  assert.equal(a.ip, '10.0.0.99');
  m.addDiscovered({ serial: 'SN-1', ips: ['10.0.0.99'] });
  assert.equal(m.entities.length, 2, 'same IP, other serial: another thing');
  assert.equal(m.addDiscovered({ ips: ['10.0.0.7'] }), null, 'an IP alone is no identity');
});

test('standalone, save downloads one .json', () => {
  const w = world({ framed: false });
  const state = { model: new TopologyModel() };
  const host = connectTopologyHost(w.S, state, { notice: false });
  assert.equal(host.save(state.model.toJSON(), { filename: 'facility' }), 'download');
  assert.deepEqual(w.downloads.map((d) => d.name), ['facility.json']);
});
