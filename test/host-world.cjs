// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* host-world.cjs — the app's vendored apk-softapp.js run in a stub window, so a
   test drives the real cad.like.audio/host@1 client (ROAD-3485). The world()/fire()
   stub of FrontEnd/shared/apk-softapp.test.js, cut to what a block round trip needs.

     const { world, hostContract } = require('./host-world.cjs');
     const w = world();                       // framed: a parent that records toParent
     const host = connect(w.S);               // the app's own connectHost wiring
     w.fire({ protocol: w.S.PROTOCOL, type: 'load', block, meta });
     w.fire({ protocol: w.S.PROTOCOL, type: 'request' });
     w.toParent.at(-1).m                      // the blockSave the CAD would get

   hostContract() finds the CAD's published schema + validator in the monorepo
   (EDITORS.CAD.Like.audio/contract), or null when this repo is checked out alone. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.resolve(__dirname, '..');
const SOFTAPP_JS = path.join(APP, 'vendor/apk-softapp/apk-softapp.js');
const ORIGIN = 'http://bench:8080';

function world({ framed = true } = {}) {
    const listeners = [];
    const toParent = [];
    const downloads = [];
    const body = { children: [], appendChild(n) { this.children.push(n); return n; } };
    const doc = {
        title: 'Test Editor',
        body,
        documentElement: { style: { setProperty() {} } },
        getElementById: (id) => body.children.find((n) => n.id === id) || null,
        createElement: (tag) => ({
            tag, style: {}, attrs: {}, textContent: '',
            setAttribute(k, v) { this.attrs[k] = v; },
            click() { downloads.push({ name: this.download, href: this.href }); },
            remove() {},
        }),
    };
    const win = {
        location: { origin: ORIGIN },
        document: doc,
        addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
        removeEventListener: (t, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
        Blob: class { constructor(parts, o) { this.text = parts.join(''); this.type = o.type; } },
        URL: { createObjectURL: (b) => { downloads.blob = b; return 'blob:1'; }, revokeObjectURL() {} },
        setTimeout: (fn) => { fn(); return 1; },
        setInterval: () => 1, clearInterval() {},
        JSON, Date, Math, Promise, Object, Array, String, Number, isFinite, parseInt, RegExp,
    };
    win.window = win; win.globalThis = win;
    const parent = { postMessage: (m, o) => toParent.push({ m: JSON.parse(JSON.stringify(m)), o }) };
    win.parent = framed ? parent : win;
    vm.runInNewContext(fs.readFileSync(SOFTAPP_JS, 'utf8'), win);
    const fire = (data, { source = parent, origin = ORIGIN } = {}) =>
        listeners.slice().forEach((fn) => fn({ data: JSON.parse(JSON.stringify(data)), source, origin }));
    return { win, S: win.APKSoftapp, toParent, downloads, fire, parent, ORIGIN };
}

/** The CAD's host@1 schema and validateMessage, when the monorepo is around this app. */
async function hostContract() {
    let dir = APP;
    for (let i = 0; i < 8; i++) {
        const c = path.join(dir, 'PODS/POD.THIN/Softapps/EDITORS/EDITORS.CAD.Like.audio/contract');
        if (fs.existsSync(path.join(c, 'validate.mjs'))) {
            const { validateMessage } = await import(path.join(c, 'validate.mjs'));
            const schema = JSON.parse(fs.readFileSync(path.join(c, 'host@1/host.schema.json'), 'utf8'));
            return { schema, validateMessage };
        }
        dir = path.dirname(dir);
    }
    return null;
}

module.exports = { world, hostContract, ORIGIN };
