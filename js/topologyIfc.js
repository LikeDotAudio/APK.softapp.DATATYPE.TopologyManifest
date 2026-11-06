// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* topologyIfc.js — THE TOPOLOGY MANIFEST'S .IFC TWIN (ROAD-3583). Save Model writes the native
   topologymanifest block AND this IFC4X3_ADD2 file through APKSoftapp.saveModel; Open Model reads it back
   to the same block. The spine (project, units, site, links, systems) is netIfc.js.

     the manifest   IfcProject Name = projectName; APK_Topology {TopologyId, ConnectionCount}
     an entity      an occurrence by its type word (netIfc kindOf: SWITCH an IfcCommunicationsAppliance
                    IPNETWORKEQUIPMENT, an AV word an IfcAudioVisualAppliance, else USERDEFINED with the word as
                    ObjectType), typed by one IfcXxxType per type word; Name = label, Tag = mnemonic; in its
                    room (an IfcSpace) or the storey; APK_NetworkDevice {EntityId, DeviceType, ParentId,
                    DeviceId}; a MAC identity is also APK_Identity and its GlobalId inst/mac:<mac>
                    its interface   IfcDistributionPort 'NET' CABLE DATA SOURCEANDSINK, APK_NetworkPort.IpAddress
                                    = the address the manifest lists (never identity)
     a link         one IfcDistributionPort DATA on each entity (Name = the port named, else none), joined by
                    one IfcRelConnectsPorts from → to; APK_Connection.ConnectionId = the link id on the from port
     the network    IfcDistributionSystem DATA 'Network', ObjectType 'SITE NETWORK' (the bench's word,
                    bim/network.py), serving the building; every DATA port its member */

import { ifcModel, readIfc, occurrenceGuid, kindOf, ident, label, int, num, str, MAC_RE } from './netIfc.js';

export { schemaOf } from './netIfc.js';

const stemOf = (n) => String(n || 'topology').replace(/\.(ifc|json)$/i, '');

/** The topologymanifest block (TopologyModel.toJSON) as IFC4X3_ADD2 STEP text. */
export function topologyToIfc(block, { name } = {}) {
  const b = block || {};
  const stem = stemOf(name || b.projectName);
  const topId = str(b.id) || stem;
  const m = ifcModel({ key: ['topology', topId], name: str(b.projectName) || stem, description: 'Topology & Manifest: the facility entities and their links',
    app: 'APK.audio Topology Manifest', appId: 'DATATYPE.TopologyManifest', storey: 'Topology' });
  const cc = num(b.connectionCount);
  m.pset('APK_Topology', m.P, [m.prop('TopologyId', ident(topId)), cc != null ? m.prop('ConnectionCount', int(cc)) : null], [m.project]);

  const netGid = m.gid('network');
  const net = m.system({ gid: netGid, name: 'Network', description: 'The facility network the manifest lists', objectType: 'SITE NETWORK', predefined: 'DATA' });
  m.pset('Pset_DistributionSystemCommon', netGid, [m.prop('Reference', ident('network'))], [net]);

  const types = new Map();
  const typeFor = (word, kind) => {
    const k = `${kind.entity}/${word}`;
    if (!types.has(k)) {
      types.set(k, m.type(`${kind.entity}TYPE`, { gid: m.gid('type', kind.entity, word), name: word || 'Device',
        elementType: kind.objectType, predefined: kind.predefined }));
    }
    return types.get(k);
  };

  const members = [];
  const byId = new Map();
  const entities = Array.isArray(b.entities) ? b.entities : [];
  entities.forEach((e, i) => {
    const eid = str(e.id) || `entity_${i}`;
    const word = str(e.type) || 'DEVICE';
    const kind = kindOf(word);
    const g = occurrenceGuid(m, e.deviceId, 'entity', eid);
    const el = m.element(kind.entity, { gid: g, name: str(e.label) || eid, objectType: kind.objectType, tag: str(e.mnemonic) || null, predefined: kind.predefined });
    m.typeOf(el, typeFor(word, kind));
    m.contain(el, m.space(e.room));
    m.pset('APK_NetworkDevice', g, [
      m.prop('EntityId', ident(eid)),
      m.prop('DeviceType', label(word)),
      e.parent_id ? m.prop('ParentId', ident(e.parent_id)) : null,
      e.deviceId ? m.prop('DeviceId', ident(e.deviceId)) : null,
    ], [el]);
    const mac = str(e.deviceId).trim().toLowerCase();
    if (MAC_RE.test(mac)) m.pset('APK_Identity', g, [m.prop('IdentityKey', ident(`mac:${mac}`)), m.prop('MacAddress', ident(mac))], [el]);
    const nicGid = m.gid('entity', eid, 'port', 'NET');
    const nic = m.port({ gid: nicGid, name: 'NET', flow: 'SOURCEANDSINK', kind: 'CABLE', system: 'DATA' });
    m.pset('APK_NetworkPort', nicGid, [e.ip ? m.prop('IpAddress', label(e.ip)) : null], [nic]);
    members.push(nic);
    byId.set(eid, { el, gid: g, ports: [nic], eid });
  });

  (Array.isArray(b.links) ? b.links : []).forEach((l, i) => {
    const a = byId.get(str(l.from));
    const z = byId.get(str(l.to));
    if (!a || !z) return;   // a link to an entity the manifest no longer holds
    const lid = str(l.id) || `L${i + 1}`;
    const end = (d, portName, side) => {
      const pg = m.gid('link', lid, side);
      const p = m.port({ gid: pg, name: str(portName) || null, flow: 'SOURCEANDSINK', kind: 'CABLE', system: 'DATA' });
      d.ports.push(p);
      members.push(p);
      return { p, pg };
    };
    const A = end(a, l.fromPort, 'from');
    const Z = end(z, l.toPort, 'to');
    m.pset('APK_Connection', A.pg, [m.prop('ConnectionId', ident(lid)), m.prop('Medium', label('wired')), m.prop('Domain', label('network'))], [A.p]);
    m.connect(A.p, Z.p, { gid: m.rel('connects', A.pg), name: lid });
  });
  for (const d of byId.values()) m.nest(d.el, d.gid, d.ports);
  m.group(net, netGid, members);
  return m.finish(stem);
}

/** An IFC model → the topologymanifest block; throws a sentence when it holds no manifest entity. */
export function topologyFromIfc(textIn) {
  const x = readIfc(textIn);
  const project = x.byType('IFCPROJECT')[0];
  const top = project ? x.psets(project).APK_Topology || {} : {};
  const owners = x.ownersOf('APK_NetworkDevice');
  if (!owners.length && !top.TopologyId) throw new TypeError('no topology in this IFC: no element carries APK_NetworkDevice and the project no APK_Topology');
  const idOf = new Map();
  const entities = owners.map((el) => {
    const ps = x.psets(el);
    const d = ps.APK_NetworkDevice || {};
    const nic = x.ports(el).find((p) => x.name(p) === 'NET' && !x.link(p));
    const where = x.container(el);
    const e = {
      id: str(d.EntityId),
      label: x.name(el),
      type: str(d.DeviceType),
      mnemonic: x.tag(el),
      parent_id: str(d.ParentId),
      room: where && where.type === 'IFCSPACE' ? x.name(where) : '',
      ip: nic ? str(x.psets(nic).APK_NetworkPort?.IpAddress) : '',
    };
    if (d.DeviceId) e.deviceId = str(d.DeviceId);
    idOf.set(el.id, e.id);
    return e;
  });
  const links = [];
  for (const r of x.byType('IFCRELCONNECTSPORTS')) {   // in the order they were written: the manifest's
    const p = x.file.byId.get(r.args[4]?.id);
    const far = x.file.byId.get(r.args[5]?.id);
    const from = idOf.get(x.host(p)?.id);
    const to = idOf.get(x.host(far)?.id);
    if (from == null || to == null) continue;
    links.push({ id: str(x.psets(p).APK_Connection?.ConnectionId) || x.name(r), from, to, fromPort: x.name(p), toPort: x.name(far) });
  }
  const block = { type: 'topologymanifest', id: str(top.TopologyId), projectName: project ? x.name(project) : '', entities, links };
  if (top.ConnectionCount != null) block.connectionCount = top.ConnectionCount;
  return block;
}
