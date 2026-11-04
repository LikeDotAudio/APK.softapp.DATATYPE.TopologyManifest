// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import test from 'node:test';
import assert from 'node:assert/strict';
import { TopologyModel } from '../js/topologyModel.js';

test('TopologyModel initializes with default broadcast entities', () => {
  const model = new TopologyModel();
  assert.ok(model.entities.length >= 8);
  const types = model.getTypeCounts();
  assert.ok(types.length >= 4);
});

test('TopologyModel filters entities by search query', () => {
  const model = new TopologyModel();
  model.searchQuery = 'cisco';
  const filtered = model.getFilteredEntities();
  assert.equal(filtered.length, 2);
  assert.ok(filtered[0].label.includes('Cisco'));

  model.searchQuery = '10.200.2.10';
  const ipFiltered = model.getFilteredEntities();
  assert.equal(ipFiltered.length, 1);
  assert.equal(ipFiltered[0].mnemonic, 'CONS-01');
});

test('TopologyModel adds and deletes entities', () => {
  const model = new TopologyModel();
  const initialCount = model.entities.length;

  const newEnt = model.addEntity({ label: 'Microphone Array', type: 'MIC', mnemonic: 'MIC-01' });
  assert.equal(model.entities.length, initialCount + 1);

  const deleted = model.deleteEntity(newEnt.id);
  assert.equal(deleted, true);
  assert.equal(model.entities.length, initialCount);
});

test('buildStandaloneHtml produces valid self-contained HTML document with zero external links', () => {
  const model = new TopologyModel();
  const html = model.buildStandaloneHtml();
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('Topology & Manifest'));
  assert.ok(html.includes('TOTAL ENTITIES'));
  assert.ok(html.includes('DSP-01'));
  assert.ok(html.endsWith('</html>'));
  // Verify no external script/link tags
  assert.equal(html.includes('<script src='), false);
  assert.equal(html.includes('<link rel="stylesheet" href='), false);
});
