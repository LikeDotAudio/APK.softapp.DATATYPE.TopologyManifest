// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class TopologyModel {
  constructor(initialData = null) {
    this.id = initialData?.id || `top_${Date.now()}`;
    this.projectName = initialData?.projectName || 'Broadcast Facility Core Topology';

    this.entities = initialData?.entities || [
      { id: 'dev_1', label: 'Core Audio DSP 01', type: 'DSP_CORE', mnemonic: 'DSP-01', parent_id: 'rack_1', room: 'Rack Room', ip: '10.200.1.21' },
      { id: 'dev_2', label: 'Core Audio DSP 02 (Redundant)', type: 'DSP_CORE', mnemonic: 'DSP-02', parent_id: 'rack_1', room: 'Rack Room', ip: '10.200.1.22' },
      { id: 'dev_3', label: 'Cisco CBS350 Primary Switch', type: 'SWITCH', mnemonic: 'SW-CORE-01', parent_id: 'rack_1', room: 'Rack Room', ip: '10.200.1.1' },
      { id: 'dev_4', label: 'Cisco CBS350 Secondary Switch', type: 'SWITCH', mnemonic: 'SW-CORE-02', parent_id: 'rack_1', room: 'Rack Room', ip: '10.200.1.2' },
      { id: 'dev_5', label: 'Audio Console Surface', type: 'CONSOLE', mnemonic: 'CONS-01', parent_id: 'room_cr', room: 'Control Room A', ip: '10.200.2.10' },
      { id: 'dev_6', label: 'Studio Stage Box 16x8', type: 'STAGEBOX', mnemonic: 'SB-01', parent_id: 'room_st', room: 'Studio A', ip: '10.200.2.31' },
      { id: 'dev_7', label: 'Master Sync Generator PTP', type: 'SYNC_GEN', mnemonic: 'PTP-01', parent_id: 'rack_1', room: 'Rack Room', ip: '10.200.1.5' },
      { id: 'dev_8', label: 'Video Switcher Frame', type: 'VISION_MIXER', mnemonic: 'VMX-01', parent_id: 'rack_2', room: 'Rack Room', ip: '10.200.1.40' },
    ];

    // the links between entities (topologyIfc.js writes each as one IfcRelConnectsPorts): { id, from, to, fromPort, toPort }
    this.links = Array.isArray(initialData?.links) ? initialData.links.map((l) => ({ ...l })) : [];
    this.connectionCount = initialData?.connectionCount || 24;
    this.searchQuery = '';
    this._devCounter = this.entities.length + 1;
  }

  addEntity(entity) {
    const id = entity.id || `dev_${this._devCounter++}`;
    const newEnt = {
      id,
      label: entity.label || `Device ${this._devCounter}`,
      type: entity.type || 'DEVICE',
      mnemonic: entity.mnemonic || `DEV-${this._devCounter}`,
      parent_id: entity.parent_id || 'rack_1',
      room: entity.room || 'Equipment Room',
      ip: entity.ip || '10.200.1.100',
    };
    this.entities.push(newEnt);
    return newEnt;
  }

  /**
   * Add a discovered thing (APKSoftapp.discovered) as an entity, or refresh the one
   * already holding its identity. Identity is the MAC, else serial, else agent —
   * never the IP, which is only shown. Returns the entity, or null without identity.
   */
  addDiscovered(thing) {
    const deviceId = thing && (thing.mac || thing.serial || thing.agent);
    if (!deviceId) return null;
    const label = thing.name || [thing.vendor, thing.model].filter(Boolean).join(' ') || deviceId;
    const ip = (thing.ips && thing.ips[0]) || '';
    const found = this.entities.find((e) => e.deviceId === deviceId);
    if (found) {
      found.label = label;
      if (ip) found.ip = ip;
      return found;
    }
    const kind = (thing.kinds && thing.kinds[0]) || 'DEVICE';
    const ent = this.addEntity({ label, type: String(kind).toUpperCase(), mnemonic: String(thing.name || deviceId).toUpperCase().slice(0, 24), room: '', ip });
    ent.deviceId = deviceId;
    ent.room = '';
    if (!ip) ent.ip = '';
    return ent;
  }

  deleteEntity(id) {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.entities.splice(idx, 1);
      this.links = this.links.filter((l) => l.from !== id && l.to !== id);
      return true;
    }
    return false;
  }

  /** The entity a word names: its id, else its mnemonic (any case). */
  findEntity(word) {
    const w = String(word ?? '').trim();
    if (!w) return null;
    return this.entities.find((e) => e.id === w) || this.entities.find((e) => String(e.mnemonic || '').toLowerCase() === w.toLowerCase()) || null;
  }

  /** Link two entities (by id or mnemonic), port names optional; the link, or null when either is unknown or both are one. */
  addLink(from, to, { fromPort = '', toPort = '' } = {}) {
    const a = this.findEntity(from);
    const z = this.findEntity(to);
    if (!a || !z || a === z) return null;
    let n = this.links.length + 1;
    while (this.links.some((l) => l.id === `L${n}`)) n++;
    const link = { id: `L${n}`, from: a.id, to: z.id, fromPort: String(fromPort || ''), toPort: String(toPort || '') };
    this.links.push(link);
    return link;
  }

  getTypeCounts() {
    const counts = new Map();
    for (const e of this.entities) {
      const t = e.type || 'UNTYPED';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  getFilteredEntities() {
    if (!this.searchQuery) return this.entities;
    const q = this.searchQuery.toLowerCase();
    return this.entities.filter((e) =>
      (e.label && e.label.toLowerCase().includes(q)) ||
      (e.type && e.type.toLowerCase().includes(q)) ||
      (e.mnemonic && e.mnemonic.toLowerCase().includes(q)) ||
      (e.room && e.room.toLowerCase().includes(q)) ||
      (e.ip && e.ip.includes(q))
    );
  }

  buildStandaloneHtml() {
    const typeCounts = this.getTypeCounts();
    const when = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const typeSummaryHtml = typeCounts.map(([type, count]) => `
      <div style="padding: 6px 12px; background: #18181b; border: 1px solid #2c2c2c; border-radius: 4px; font-size: 11px; display: inline-flex; align-items: center; gap: 8px;">
        <span style="font-weight: 700; color: #f4f4f5;">${esc(type)}</span>
        <span style="background: #2c2c2c; color: #F4902C; padding: 2px 6px; border-radius: 10px; font-weight: 600;">${count}</span>
      </div>
    `).join(' ');

    const cardsHtml = this.entities.map((e) => `
      <div class="entity-card" style="padding: 14px; background: #18181b; border: 1px solid #2c2c2c; border-radius: 6px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-family: monospace; font-size: 12px; font-weight: 700; color: #F4902C;">${esc(e.mnemonic)}</span>
          <span style="font-size: 10px; text-transform: uppercase; color: #4A9EFF; background: #0f0f11; padding: 2px 6px; border-radius: 3px;">${esc(e.type)}</span>
        </div>
        <div style="font-size: 13px; font-weight: 600; color: #f4f4f5;">${esc(e.label)}</div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888888; margin-top: 4px;">
          <span>Room: ${esc(e.room || '—')}</span>
          <span style="font-family: monospace;">${esc(e.ip || '—')}</span>
        </div>
        <div style="font-size: 9px; font-family: monospace; color: #52525b; margin-top: 2px;">OID: ${esc(e.id)}</div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Topology & Manifest — ${esc(this.projectName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #121212; color: #f4f4f5; margin: 0; padding: 24px; }
    h1 { margin: 0 0 6px 0; font-size: 20px; }
    .header { border-bottom: 1px solid #2c2c2c; padding-bottom: 16px; margin-bottom: 20px; }
    .stats-row { display: flex; gap: 14px; margin-bottom: 20px; }
    .stat { padding: 12px 18px; background: #18181b; border: 1px solid #2c2c2c; border-radius: 6px; }
    .stat-v { font-size: 18px; font-weight: 800; color: #F4902C; }
    .stat-l { font-size: 10px; color: #888888; text-transform: uppercase; margin-bottom: 4px; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(this.projectName)} — Topology & Manifest</h1>
    <div style="font-size: 11px; color: #888888;">Generated: ${when} • Self-contained offline report</div>
  </div>

  <div class="stats-row">
    <div class="stat"><div class="stat-l">TOTAL ENTITIES</div><div class="stat-v">${this.entities.length}</div></div>
    <div class="stat"><div class="stat-l">EQUIPMENT TYPES</div><div class="stat-v">${typeCounts.length}</div></div>
    <div class="stat"><div class="stat-l">CONNECTIONS</div><div class="stat-v">${esc(this.connectionCount)}</div></div>
  </div>

  <div style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 8px;">
    ${typeSummaryHtml}
  </div>

  <div class="cards-grid">
    ${cardsHtml}
  </div>
</body>
</html>`;
  }

  toJSON() {
    return {
      type: 'topologymanifest',
      id: this.id,
      projectName: this.projectName,
      connectionCount: this.connectionCount,
      entities: this.entities,
      links: this.links,
    };
  }
}
