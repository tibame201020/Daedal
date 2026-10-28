import { isDeepStrictEqual } from 'node:util';
import { clone, isText, validateGoal } from './labyrinth-common.mjs';

function readGoals(state, root) {
    const restored = new Map();
    for (const n of state.nodes) {
      if (!n || !isText(n.id) || restored.has(n.id) || !Number.isSafeInteger(n.version) || n.version < 1 ||
          !Number.isSafeInteger(n.compositionVersion) || n.compositionVersion < 1 ||
          !isDeepStrictEqual(validateGoal(n), { id: n.id, outcome: n.outcome, acceptance: n.acceptance, boundary: n.boundary }))
        throw new Error('invalid or duplicate snapshot goal');
      restored.set(n.id, n);
    }
    if (!restored.has(root.id) || restored.get(root.id).parentId !== null ||
      [...restored.values()].filter(n => n.parentId === null).length !== 1) throw new Error('invalid snapshot root');
    for (const n of restored.values()) {
      const visited = new Set(); let cursor = n;
      while (cursor.parentId !== null) {
        if (visited.has(cursor.id) || !restored.has(cursor.parentId)) throw new Error('invalid snapshot parent/cycle');
        visited.add(cursor.id); cursor = restored.get(cursor.parentId);
      }
      let allow; const deny = new Set();
      const chain = []; cursor = n;
      while (cursor) { chain.unshift(cursor); cursor = cursor.parentId === null ? null : restored.get(cursor.parentId); }
      for (const member of chain) {
        if (allow !== undefined && member.boundary.allow.some(cap => !allow.includes(cap))) throw new Error('snapshot boundary widening');
        allow = member.boundary.allow; member.boundary.deny.forEach(x => deny.add(x));
      }
    }
    return restored;
}
function checkRelations(state, restored, seed) {
    const seenEdges = new Set();
    for (const e of state.edges) {
      if (!e || !restored.has(e.fromId) || !restored.has(e.toId) || e.fromId === e.toId ||
        !['depends_on','unknown'].includes(e.type) || seenEdges.has(e.fromId + '\0' + e.toId)) throw new Error('invalid snapshot relation');
      seenEdges.add(e.fromId + '\0' + e.toId);
    }
    const seenRefs = new Set();
    for (const r of state.references) {
      const key = [r?.fromId, r?.sourceProjectId, r?.sourceGoalId].join('\0');
      if (!r || !restored.has(r.fromId) || !isText(r.sourceProjectId) || r.sourceProjectId === seed.projectId ||
        !isText(r.sourceGoalId) || !/^[a-f0-9]{64}$/i.test(r.revision ?? '') ||
        r.type !== 'live-reference' || seenRefs.has(key)) throw new Error('invalid snapshot project reference');
      seenRefs.add(key);
    }
}
function readCollections(state, restored, seed) {
    const mapPairs = (values, label) => {
      const output = new Map();
      for (const entry of values) {
        if (!Array.isArray(entry) || entry.length !== 2 || !isText(entry[0]) || output.has(entry[0])) throw new Error('invalid snapshot ' + label);
        output.set(entry[0], entry[1]);
      }
      return output;
    };
    const history = mapPairs(state.past, 'history'), contracts = mapPairs(state.issuedContracts, 'contracts');
    const proofs = mapPairs(state.acceptedProofs, 'proofs');
    const discovered = mapPairs(state.candidates, 'candidates');
    const accepted = mapPairs(state.acceptedKnowledge, 'accepted knowledge');
    for (const [id, c] of discovered) {
      if (!c || id !== c.id || !restored.has(c.fromId) || !restored.has(c.toId) ||
          !['candidate','accepted'].includes(c.status) || !c.source || !isText(c.source.uri) ||
          !isText(c.source.revision) || !/^[a-f0-9]{64}$/i.test(c.source.sha256 ?? ''))
        throw new Error('invalid snapshot discovery');
    }
    const indexed = new Set();
    for (const [id, records] of accepted) {
      if (!restored.has(id) || !Array.isArray(records) || records.some(c =>
        c.fromId !== id || c.status !== 'accepted' || !isDeepStrictEqual(c, discovered.get(c.id)) ||
        indexed.has(c.id) || !state.edges.some(e => e.fromId === c.fromId && e.toId === c.toId && e.type === c.type)))
        throw new Error('invalid snapshot accepted knowledge');
      records.forEach(c => indexed.add(c.id));
    }
    if ([...discovered.values()].some(c => (c.status === 'accepted') !== indexed.has(c.id)))
      throw new Error('invalid snapshot accepted knowledge index');
    if (history.size !== restored.size || [...restored.keys()].some(id => !Array.isArray(history.get(id)))) throw new Error('invalid snapshot history');
    for (const [id, contract] of contracts) {
      if (!contract || id !== contract.contractId || contract.projectId !== seed.projectId ||
        !restored.has(contract.goalId) || !Array.isArray(contract.pins) || contract.enforcement !== 'advisory') throw new Error('invalid snapshot contract');
    }
    for (const [id, rows] of proofs) {
      if (!restored.has(id) || !Array.isArray(rows) || rows.some(p => p.goalId !== id || p.projectId !== seed.projectId ||
        p.verdict !== 'pass' || !p.contract || !isDeepStrictEqual(p.contract, contracts.get(p.contract.contractId))))
        throw new Error('invalid snapshot proof');
    }
    return { history, contracts, proofs, discovered, accepted };
}
export function restoreSnapshot({ initialSnapshot, seed, root, bootstrapSeed, nodes, edges, references,
  past, changes, issuedContracts, acceptedProofs, candidates, acceptedKnowledge }) {
    const state = clone(initialSnapshot);
    if (!state || state.schemaVersion !== 2 || state.projectId !== seed.projectId || state.rootId !== root.id ||
        !isDeepStrictEqual(state.bootstrapSeed, bootstrapSeed) ||
        !Array.isArray(state.nodes) || !Array.isArray(state.edges) || !Array.isArray(state.references) ||
        !Array.isArray(state.candidates) || !Array.isArray(state.acceptedKnowledge) ||
        !Array.isArray(state.past) || !Array.isArray(state.changes) || !Array.isArray(state.issuedContracts) ||
        !Array.isArray(state.acceptedProofs)) throw new Error('invalid snapshot identity or schema');
    const restored = readGoals(state, root);
    checkRelations(state, restored, seed);
    const { history, contracts, proofs, discovered, accepted } = readCollections(state, restored, seed);
    nodes.clear(); for (const [id,n] of restored) nodes.set(id,n);
    edges.push(...state.edges); references.push(...state.references);
    past.clear(); for (const [id,rows] of history) past.set(id,rows);
    changes.push(...state.changes);
    for (const [id,c] of contracts) issuedContracts.set(id,c);
    for (const [id,p] of proofs) acceptedProofs.set(id,p);
    for (const [id,c] of discovered) candidates.set(id,c);
    for (const [id,records] of accepted) acceptedKnowledge.set(id,records);
}
