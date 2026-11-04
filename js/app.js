// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { TopologyModel } from './topologyModel.js';
import { connectTopologyHost, blockMeta } from './topologyHost.js';
import { showDiscovered, loadDiscoveredConfig } from './discoveredPanel.js';

const S = window.APKSoftapp;
const esc = S ? S.esc : (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { model: new TopologyModel() };
let model = state.model;

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

  document.getElementById('btn-open-block')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          loadLocal(new TopologyModel(parsed));
        } catch (err) {
          alert('Failed to parse topology json: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  document.getElementById('btn-discovered')?.addEventListener('click', async () => {
    const panel = document.getElementById('discovered-panel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (panel.hidden || panel.dataset.started) return;
    panel.dataset.started = '1';
    const cfg = await loadDiscoveredConfig();
    await showDiscovered(document.getElementById('discovered-table'), {
      S, T: window.APKTable,
      statusEl: document.getElementById('discovered-status'),
      kinds: Array.isArray(cfg.kinds) ? cfg.kinds : [],
      tableId: 'topology-discovered',
      pickLabel: 'Add to manifest',
      onPick: (thing) => {
        if (model.addDiscovered(thing)) { changed(); renderAll(); }
      },
    });
  });

  document.getElementById('btn-save-block')?.addEventListener('click', () => {
    const how = host ? host.save(model.toJSON(), blockMeta(model)) : '';
    const tag = document.getElementById('block-tag');
    if (tag && how) tag.textContent = how === 'host' ? 'SAVED TO THE CAD' : 'DOWNLOADED .JSON';
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    if (host) host.close();
  });
});
