// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ROAD-3583: the manifest's .ifc twin (js/topologyIfc.js) — written byte-deterministically, read back to the
// same block. IFC_OUT=<dir> npm test also writes the file there, for IfcOpenShell validate + the BIM oracle
// (DATABASE.server.BIM SRC/tools/ifc/editors_census.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TopologyModel } from '../js/topologyModel.js';
import { topologyToIfc, topologyFromIfc, schemaOf } from '../js/topologyIfc.js';

function out(name, text) {
  if (!process.env.IFC_OUT) return;
  mkdirSync(process.env.IFC_OUT, { recursive: true });
  writeFileSync(join(process.env.IFC_OUT, name), text);
}

function manifest() {
  const m = new TopologyModel({ id: 'top_demo', projectName: 'Broadcast Facility Core Topology' });
  m.addDiscovered({ mac: 'B8:27:EB:00:00:01', name: 'Stagebox', ips: ['10.200.2.40'], kinds: ['dante'] });
  assert.ok(m.addLink('SB-01', 'SW-CORE-01', { fromPort: 'Dante Pri', toPort: 'ge-0/0/1' }));
  assert.ok(m.addLink('dsp-01', 'SW-CORE-01'));
  assert.ok(m.addLink('dev_4', 'SW-CORE-01', { fromPort: 'ISL', toPort: 'ISL' }));
  return JSON.parse(JSON.stringify(m.toJSON()));
}

test('the manifest: the same block writes the same bytes, and reads back to the same block', () => {
  const block = manifest();
  const a = topologyToIfc(block, { name: 'facility' });
  assert.equal(a, topologyToIfc(JSON.parse(JSON.stringify(block)), { name: 'facility' }));
  assert.equal(schemaOf(a), 'IFC4X3_ADD2');
  assert.match(a, /IFCDISTRIBUTIONSYSTEM\('[^']+',\$,'Network','The facility network the manifest lists','SITE NETWORK',\$,\.DATA\.\)/);
  assert.match(a, /IFCCOMMUNICATIONSAPPLIANCE\('[^']+',\$,'Cisco CBS350 Primary Switch',\$,\$,\$,\$,'SW-CORE-01',\.IPNETWORKEQUIPMENT\.\)/);
  assert.match(a, /IFCAUDIOVISUALAPPLIANCE\('[^']+',\$,'Core Audio DSP 01',\$,'DSP_CORE',\$,\$,'DSP-01',\.USERDEFINED\.\)/);
  assert.match(a, /IFCSPACE\('[^']+',\$,'Rack Room'/);
  assert.match(a, /'IpAddress',\$,IFCLABEL\('10\.200\.1\.21'\)/);
  assert.equal((a.match(/IFCRELCONNECTSPORTS\(/g) || []).length, 3);
  out('topology-manifest.ifc', a);
  const b = topologyFromIfc(a);
  assert.deepEqual(b, block);
  assert.equal(topologyToIfc(b, { name: 'facility' }), a, 'read and written again: the same file');
});

test('identity is the MAC, never the IP: a discovered entity is inst/mac:<mac>, its address only a listed value', () => {
  const a = topologyToIfc(manifest(), { name: 'f' });
  assert.match(a, /'MacAddress',\$,IFCIDENTIFIER\('b8:27:eb:00:00:01'\)/);
  assert.match(a, /'IpAddress',\$,IFCLABEL\('10\.200\.2\.40'\)/);
  assert.doesNotMatch(a, /IFCIDENTIFIER\('10\.200/);
});

test('a link to an entity that is gone is dropped; deleting an entity drops its links', () => {
  const m = new TopologyModel({ id: 't' });
  m.addLink('DSP-01', 'SW-CORE-01');
  m.deleteEntity('dev_1');
  assert.deepEqual(m.links, []);
  const block = { ...m.toJSON(), links: [{ id: 'L9', from: 'nope', to: 'dev_3', fromPort: '', toPort: '' }] };
  assert.deepEqual(topologyFromIfc(topologyToIfc(block)).links, []);
  assert.equal(m.addLink('DSP-02', 'DSP-02'), null, 'an entity is not linked to itself');
});

test('no manifest in the file: a sentence, never a half-read block', () => {
  const a = topologyToIfc({ id: 't', projectName: 'x', entities: [] }).replace(/APK_Topology/g, 'APK_Other');
  assert.throws(() => topologyFromIfc(a), /no topology in this IFC/);
});
