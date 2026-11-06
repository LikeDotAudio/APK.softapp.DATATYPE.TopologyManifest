// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { TopologyModel } from './topologyModel.js';
import { connectTopologyHost, blockMeta } from './topologyHost.js';
import { topologyToIfc, topologyFromIfc, schemaOf } from './topologyIfc.js';

const S = window.APKSoftapp;
const esc = S ? S.esc : (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { model: new TopologyModel() };
let model = state.model;

if (S) S.describe({
  name: 'Topology & Manifest Visualizer',
  does: 'Shows the facility entities (devices, racks, rooms) as cards and exports them as one standalone HTML manifest.',
  inputs: [
    { name: 'Topology block', from: 'the CAD (topologymanifest block: projectName, entities[])', kind: 'block' },
    { name: 'Topology file', from: '📂 Open: a .json saved by Save & Return, or its .ifc twin', kind: 'file' },
    { name: 'Discovered devices', from: 'the bus, via ⚡ Discovered (kinds filter from config/discovered.json)', kind: 'bus', topic: 'Device/<kind>/<id>' },
  ],
  outputs: [
    { name: 'Standalone manifest', to: '<project>_manifest.html download (📄 Export Standalone HTML)', kind: 'file' },
    { name: 'Topology block', to: 'the CAD drawing (Save & Return); standalone, <project>.json beside its .ifc twin (Save Model)', kind: 'block' },
    { name: 'IFC twin', to: '<project>.ifc (IFC4X3_ADD2) with the .json when standalone: each entity an occurrence with a DATA port, each link an IfcRelConnectsPorts, all of them one SITE NETWORK IfcDistributionSystem', kind: 'file' },
  ],
  controls: [
    { name: 'Search', how: 'Type in the search box: filters cards by label, IP, room or mnemonic' },
    { name: '➕ Add Entity', how: 'Asks for a label and a type, adds a card' },
    { name: '🔗 Link', how: 'Asks for two entities (mnemonic or id) and, optionally, their ports: one link between them' },
    { name: 'Delete', how: 'On a card: removes that entity' },
    { name: '⚡ Discovered', how: 'Shows what the bus knows; Add to manifest copies one in (by MAC / serial)' },
    { name: '📂 Open / 📄 Export / 💾 Save & Return / ✕', how: 'Load a .json or .ifc, export HTML, send back to the CAD (standalone: the .json and its .ifc twin), close the window' },
  ],
  problems: ['bad_json', 'bad_input', 'file_unreadable', 'config_invalid', 'save_failed'],
});

/** Why a parsed topology file cannot load ('' when it can): names the field. */
function topologyFault(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'The file is JSON but not a topology object ({ projectName, entities: [...] }).';
  if (!Array.isArray(parsed.entities)) return parsed.entities === undefined
    ? 'The file has no "entities" field (a list of { id, label, type, ... }).'
    : `Field "entities" is ${typeof parsed.entities}, not a list.`;
  const i = parsed.entities.findIndex((e) => !e || typeof e !== 'object' || Array.isArray(e));
  if (i >= 0) return `entities[${i}] is ${JSON.stringify(parsed.entities[i])}, not an { id, label, type } object.`;
  return '';
}

const host = S ? connectTopologyHost(S, state, {
  onLoaded: (m, meta) => {
    model = m;
    const tag = document.getElementById('block-tag');
    if (tag && (meta.title || meta.blockName)) tag.textContent = meta.title || meta.blockName;
    renderAll();
  },
}) : null;

/** Replace the model from a local file (not from the CAD). */
function loadLocal(next) {
  model = state.model = next;
  changed();
  renderAll();
}

function changed() {
  if (host) host.changed(model.toJSON());
}

function renderHeaderStats() {
  const container = document.getElementById('telemetry-metrics');
  if (!container) return;

  const typeCounts = model.getTypeCounts();
  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 14px; font-size: 10px; color: var(--osc-text-muted);">
      <span>ENTITIES: <strong style="color: var(--osc-text-primary);">${model.entities.length}</strong></span>
      <span>TYPES: <strong style="color: var(--osc-accent-secondary);">${typeCounts.length}</strong></span>
      <span>CONNECTIONS: <strong style="color: var(--osc-accent-primary);">${esc(model.connectionCount)}</strong></span>
      <span>LINKS: <strong style="color: var(--osc-text-primary);">${model.links.length}</strong></span>
    </div>
  `;
}

function renderTypePills() {
  const container = document.getElementById('type-pills');
  if (!container) return;

  const typeCounts = model.getTypeCounts();
  container.innerHTML = typeCounts.map(([type, count]) => `
    <button class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 7px;">
      <span>${esc(type)}</span>
      <span style="background: var(--osc-border-default); color: var(--osc-accent-primary); padding: 1px 4px; border-radius: 8px; font-size: 9px;">${count}</span>
    </button>
  `).join('');
}

function renderCards() {
  const container = document.getElementById('cards-grid');
  if (!container) return;

  const filtered = model.getFilteredEntities();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--osc-text-muted);">
        No entities match query "${esc(model.searchQuery)}".
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((e) => `
    <div class="entity-card" style="padding: 12px; background: var(--osc-bg-surface); border: 1px solid var(--osc-border-default); border-radius: 6px; display: flex; flex-direction: column; gap: 6px; transition: border-color 0.15s ease;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--osc-accent-primary);">${esc(e.mnemonic)}</span>
        <span style="font-size: 9px; text-transform: uppercase; color: var(--osc-accent-secondary); background: var(--osc-bg-input); padding: 2px 5px; border-radius: 3px;">${esc(e.type)}</span>
      </div>
      <div style="font-size: 12px; font-weight: 600; color: var(--osc-text-primary);">${esc(e.label)}</div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--osc-text-muted); margin-top: 4px;">
        <span>Room: ${esc(e.room || '—')}</span>
        <span style="font-family: var(--font-mono);">${esc(e.ip || '—')}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--osc-border-default); padding-top: 6px; margin-top: 4px;">
        <span style="font-size: 9px; font-family: var(--font-mono); color: var(--osc-text-subtle);">OID: ${esc(e.id)}</span>
        <button class="btn btn-secondary btn-sm btn-delete-ent" data-id="${esc(e.id)}" style="padding: 1px 5px; font-size: 9px; color: var(--osc-status-danger);">Delete</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-delete-ent').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      model.deleteEntity(id);
      changed();
      renderAll();
    });
  });
}

function renderAll() {
  renderHeaderStats();
  renderTypePills();
  renderCards();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();

  document.getElementById('inp-search')?.addEventListener('input', (e) => {
    model.searchQuery = e.target.value;
    renderCards();
  });

  document.getElementById('btn-add-entity')?.addEventListener('click', () => {
    const name = window.prompt('Enter entity label:', 'New Device');
    if (!name) return;
    const type = window.prompt('Enter entity type:', 'DEVICE') || 'DEVICE';
    model.addEntity({ label: name, type });
    changed();
    renderAll();
  });

  document.getElementById('btn-add-link')?.addEventListener('click', () => {
    const from = window.prompt('Link from (mnemonic or id):', model.entities[0]?.mnemonic || '');
    if (!from) return;
    const to = window.prompt('Link to (mnemonic or id):', '');
    if (!to) return;
    const fromPort = window.prompt(`Port on ${from} (optional):`, '') || '';
    const toPort = window.prompt(`Port on ${to} (optional):`, '') || '';
    if (!model.addLink(from, to, { fromPort, toPort })) {
      const missing = [from, to].filter((w) => !model.findEntity(w));
      if (S) S.showProblem('bad_input', { subject: 'Link', detail: missing.length ? `No entity is ${missing.map((w) => `"${w}"`).join(' or ')}.` : 'A link joins two different entities.', fix: ['Give the mnemonic (or OID) of two cards on the page.'] });
      return;
    }
    changed();
    renderAll();
  });

  document.getElementById('btn-export-html')?.addEventListener('click', () => {
    const html = model.buildStandaloneHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.projectName.toLowerCase().replace(/\s+/g, '_')}_manifest.html`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 📂 Open: a topology .json, or an .ifc (its manifest, topologyIfc.js)
  document.getElementById('btn-open-block')?.addEventListener('click', async () => {
    if (!S) return;
    const r = await S.openModel({
      fromIfc: (text) => topologyFromIfc(text),
      fromJson: (parsed) => { const fault = topologyFault(parsed); if (fault) throw new Error(fault); return parsed; },
    });
    if (!r.ok) {
      if (!r.cancelled) S.showProblem(r.problem, { onRetry: () => document.getElementById('btn-open-block')?.click(),
        fix: ['Pick a topology .json saved by Save & Return (it holds projectName and entities[]), or its .ifc twin.'] });
      return;
    }
    loadLocal(new TopologyModel(r.model));
    const tag = document.getElementById('block-tag');
    if (tag) tag.textContent = r.kind === 'ifc' ? `${r.name} · ${schemaOf(r.text)}` : r.name;
  });

  document.getElementById('btn-discovered')?.addEventListener('click', async () => {
    const panel = document.getElementById('discovered-panel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (panel.hidden || panel.dataset.started) return;
    panel.dataset.started = '1';
    // the Discovered panel is the shared client's (ROAD-3502): kinds in config/discovered.json
    if (!window.APKSoftapp) return;
    await window.APKSoftapp.discoveredPanel(document.getElementById('discovered-table'), {
      status: document.getElementById('discovered-status'),
      configUrl: './config/discovered.json',
      id: 'topology-discovered',
      pickLabel: 'Add to manifest',
      onPick: (thing) => {
        if (model.addDiscovered(thing)) { changed(); renderAll(); }
      },
    });
  });

  document.getElementById('btn-save-block')?.addEventListener('click', async () => {
    let how = '';
    const retry = () => document.getElementById('btn-save-block')?.click();
    const meta = blockMeta(model);
    if (host && !host.embedded && typeof S.saveModel === 'function') {
      // standalone: Save Model — the .json and its .ifc twin, both or neither
      const r = await S.saveModel(model.toJSON(), { name: meta.filename, toIfc: (b) => topologyToIfc(b, { name: meta.filename }) });
      if (!r.ok) { if (!r.cancelled) S.showProblem(r.problem || 'save_failed', { onRetry: retry }); return; }
      const tag = document.getElementById('block-tag');
      if (tag) tag.textContent = r.via === 'directory' ? 'SAVED .JSON + .IFC' : 'DOWNLOADED .JSON + .IFC';
      return;
    }
    try { how = host ? host.save(model.toJSON(), meta) : ''; }
    catch (e) { S.showProblem('save_failed', { subject: model.projectName, detail: e && e.message ? e.message : String(e), onRetry: retry }); return; }
    const tag = document.getElementById('block-tag');
    if (tag && !host) tag.textContent = 'NOT SAVED: SHARED CODE MISSING';
    if (tag && how) tag.textContent = how === 'host' ? 'SAVED TO THE CAD' : 'DOWNLOADED .JSON';
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    if (host) host.close();
  });
});
