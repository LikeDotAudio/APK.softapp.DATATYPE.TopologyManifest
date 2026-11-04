// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* discoveredPanel.js — what the bus knows about, as an APKTable (ROAD-3491).

   Reads APKSoftapp.discovered() (APKBus + APKContracts.Topics; identity is the
   MAC, else the serial, else the agent — never an IP) and draws one row per
   thing with its live state (good | kinda | dead, and why). The kinds it
   filters on come from config/discovered.json, never from a list in source.
   No SDK, no bus or no broker: the reason goes on screen, nothing is invented. */

/** The identity of a thing: MAC, else serial, else the agent's own name. Never an IP. */
export function thingIdentity(t) {
  return (t && (t.mac || t.serial || t.agent)) || '';
}

/** One table row for one discovered thing. Pure: the tests feed it fixtures. */
export function thingRow(t) {
  const live = (t && t.live) || {};
  return {
    id: thingIdentity(t) || (t && t.id) || '',
    name: (t && t.name) || '',
    make: [t && t.vendor, t && t.model].filter(Boolean).join(' '),
    identity: thingIdentity(t),
    ips: ((t && t.ips) || []).join(', '),
    kinds: ((t && t.kinds) || []).join(', '),
    state: live.state || 'kinda',
    why: live.why || '',
  };
}

/** The app's discovery tunables (config/discovered.json), or {} when the file is not served. */
export async function loadDiscoveredConfig(url = './config/discovered.json') {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.ok ? await r.json() : {};
  } catch (_) {
    return {};
  }
}

function stateBadge(doc, row) {
  const b = doc.createElement('span');
  b.className = 'apk-state-text';
  b.setAttribute('data-apk-state', row.state);
  b.setAttribute('data-apk-tone', row.state);
  b.textContent = row.state;
  b.title = row.why;
  return b;
}

/**
 * Draw the discovered things into `host` (an element) as APKTable `tableId`.
 * opts: { S: APKSoftapp, T: APKTable, statusEl, kinds, tableId, pickLabel, onPick(thing) }
 * Resolves with the discovered() handle ({ ok, reason, things, stop }).
 */
export async function showDiscovered(host, opts) {
  const { S, T, statusEl, kinds = [], tableId, pickLabel = 'Use', onPick } = opts;
  const doc = host.ownerDocument;
  const say = (text, state) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.setAttribute('data-apk-state', state);
    statusEl.setAttribute('data-apk-tone', state);
  };
  if (!S || !T) {
    say('The softapp client did not load (vendor/apk-softapp, vendor/apk-table).', 'dead');
    return { ok: false, reason: 'no client', things: () => [], stop() {} };
  }
  let things = [];
  const columns = [
    { key: 'name', label: 'Name', editable: false },
    { key: 'make', label: 'Make / model', editable: false },
    { key: 'identity', label: 'Identity (MAC / serial)', editable: false, mono: true },
    { key: 'ips', label: 'IP', editable: false, mono: true },
    { key: 'state', label: 'Live', render: (v, row) => stateBadge(doc, row) },
    { key: 'why', label: 'Why', editable: false },
  ];
  if (onPick) {
    columns.push({
      key: 'pick', label: '', render: (v, row, i) => {
        const btn = doc.createElement('button');
        btn.className = 'btn btn-secondary btn-sm';
        btn.textContent = pickLabel;
        btn.addEventListener('click', () => onPick(things[i]));
        return btn;
      },
    });
  }
  const table = T.create(host, {
    id: tableId, columns, rows: [], editable: false,
    empty: kinds.length ? `Nothing on the bus matches ${kinds.join(', ')} yet.` : 'Nothing on the bus yet.',
  });
  const draw = (list) => {
    things = list;
    table.setRows(list.map(thingRow));
    say(`${list.length} on the bus${kinds.length ? ` (${kinds.join(', ')})` : ''}. Trust decays after ${S.TRUST_MINUTES} min.`, list.length ? 'good' : 'kinda');
  };
  say('Asking the bus…', 'kinda');
  const d = await S.discovered({ kinds, onChange: draw });
  if (!d.ok) say(d.reason, 'dead');
  else draw(d.things());
  return d;
}
