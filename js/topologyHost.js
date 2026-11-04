// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* topologyHost.js — the manifest block in and out of the CAD over
   cad.like.audio/host@1, through the vendored APKSoftapp client (ROAD-3485 /
   ROAD-3491). No DOM here: the round-trip test drives it with the real client. */

import { TopologyModel } from './topologyModel.js';

export const EDITOR = 'Topology Manifest';
export const BLOCK_TYPE = 'topologymanifest';

export function blockMeta(model) {
  return { filename: String(model.projectName || 'topology').toLowerCase().replace(/\s+/g, '_'), title: String(model.projectName || 'Topology') };
}

/** state.model is the live TopologyModel; onLoaded(model, meta) redraws. Returns the host handle. */
export function connectTopologyHost(S, state, { onLoaded, notice } = {}) {
  return S.connectHost({
    editor: EDITOR,
    blockType: BLOCK_TYPE,
    block: state.model.toJSON(),
    notice,
    onLoad: (block, meta) => {
      state.model = new TopologyModel(block);
      if (onLoaded) onLoaded(state.model, meta);
    },
    onRequest: () => ({ block: state.model.toJSON(), meta: blockMeta(state.model) }),
  });
}
