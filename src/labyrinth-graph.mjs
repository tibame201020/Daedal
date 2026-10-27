import { selectQualityProfile, sameQualityProfile } from './quality-review.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { clone, sorted, isText, requireText, validateBoundary } from './labyrinth-common.mjs';

function makeTopology(nodes) {
  const get = id => {
    const node = nodes.get(id);
    if (!node) throw new Error(`unknown goal: ${id}`);
    return node;
  };
  const lineage = id => {
    const result = []; let cursor = get(id);
    while (cursor) { result.unshift(cursor); cursor = cursor.parentId ? get(cursor.parentId) : null; }
    return result;
  };
  const effectiveBoundary = id => {
    let allow; const deny = new Set();
    for (const n of lineage(id)) {
      allow = allow === undefined ? n.boundary.allow : allow.filter(x => n.boundary.allow.includes(x));
      n.boundary.deny.forEach(x => deny.add(x));
    }
    return { allow: sorted((allow ?? []).filter(x => !deny.has(x))), deny: sorted(deny) };
  };
  const validateChildBoundary = (parentId, boundary) => {
    const effective = effectiveBoundary(parentId);
    const next = boundary === undefined ? { allow: effective.allow, deny: [] } : validateBoundary(boundary);
    if (next.allow.some(x => !effective.allow.includes(x))) throw new Error('child boundary cannot widen parent capabilities');
    return next;
  };
  const descendants = id => {
    const result = [];
    for (const n of nodes.values()) if (n.parentId === id) result.push(n.id, ...descendants(n.id));
    return result;
  };
  return { get, lineage, effectiveBoundary, validateChildBoundary, descendants };
}

function makePins({ get, lineage, descendants, edges }) {
  const pinSet = id => {
    // Ancestor content is inherited, but its sibling composition is not.
    const pins = new Map();
    const queue = [];
    const add = (goalId, composition = false) => {
      const previous = pins.get(goalId);
      if (previous === undefined || (composition && !previous)) {
        pins.set(goalId, composition || previous || false);
        queue.push(goalId);
      }
    };
    const addBranch = goalId => {
      for (const ancestor of lineage(goalId).slice(0, -1)) add(ancestor.id);
      add(goalId, true);
      for (const child of descendants(goalId)) add(child, true);
    };
    addBranch(id);
    while (queue.length) {
      const fromId = queue.shift();
      for (const edge of edges.filter(e => e.fromId === fromId)) addBranch(edge.toId);
    }
    return sorted([...pins.keys()]).map(goalId => ({
      id: goalId, version: get(goalId).version,
      ...(pins.get(goalId) ? { compositionVersion: get(goalId).compositionVersion } : {}),
    }));
  };
  const hasUnknown = ids => edges.some(e => e.type === 'unknown' && ids.includes(e.fromId));
  return { pinSet, hasUnknown };
}

function makeReferences({ seed, get, effectiveBoundary, lineage, referenceResolver, references }) {
  const inspectReference = id => {
    const n = get(id);
    const projection = { projectId: seed.projectId, goalId: id, outcome: n.outcome,
      acceptance: clone(n.acceptance), boundary: effectiveBoundary(id),
      // Ancestor goal revisions matter; an unrelated sibling's composition does not.
      // The referenced Goal's own child composition remains part of its accepted surface.
      lineage: lineage(id).map(x => ({ id: x.id, version: x.version,
        ...(x.id === id ? { compositionVersion: x.compositionVersion } : {}) })) };
    return { ...projection, revision: createHash('sha256').update(JSON.stringify(projection)).digest('hex') };
  };
  const liveReference = ref => {
    if (!referenceResolver || typeof referenceResolver.inspect !== 'function') return { status: 'unresolved' };
    let source;
    try { source = referenceResolver.inspect({ projectId: ref.sourceProjectId, goalId: ref.sourceGoalId }); }
    catch { return { status: 'unresolved' }; }
    if (!source || source.projectId !== ref.sourceProjectId || source.goalId !== ref.sourceGoalId ||
      !/^[a-f0-9]{64}$/i.test(source.revision ?? '')) return { status: 'unresolved' };
    return { status: source.revision === ref.revision ? 'current' : 'stale', source };
  };
  const referenceStatus = ids => {
    const states = references.filter(r => ids.includes(r.fromId)).map(liveReference);
    if (states.some(s => s.status === 'stale')) return 'stale';
    if (states.some(s => s.status === 'unresolved')) return 'unresolved';
    return 'current';
  };
  return { inspectReference, liveReference, referenceStatus };
}

function makeContext({ seed, get, statusFor, lineage, nodes, effectiveBoundary, edges, references,
  candidates, acceptedKnowledge, pinSet }) {
  const context = id => {
    const chain = lineage(id);
    return {
      projectId: seed.projectId,
      goal: { ...clone(get(id)), status: statusFor(id) },
      ancestors: clone(chain.slice(0, -1).map(n => ({ id: n.id, outcome: n.outcome, version: n.version, boundary: n.boundary }))),
      children: sorted([...nodes.values()].filter(n => n.parentId === id).map(n => n.id)),
      acceptance: clone(get(id).acceptance),
      boundary: effectiveBoundary(id),
      relations: clone(edges.filter(e => e.fromId === id)),
      references: clone(references.filter(r => r.fromId === id)),
      discoveryCandidates: clone([...candidates.values()].filter(c => c.fromId === id)),
      acceptedKnowledge: clone(acceptedKnowledge.get(id) ?? []),
      pins: pinSet(id),
    };
  };
  return context;
}

function checkQualityContract({ contract, qualityPolicy, qualityEvidenceProvider,
  seed, get, current, effectiveBoundary }) {
    if (!!contract.qualityProfile !== !!qualityPolicy) {
      return { status: contract.qualityProfile ? 'unresolved' : 'stale', reason: 'quality policy unavailable or introduced' };
    }
    if (contract.qualityProfile) {
      if (typeof qualityEvidenceProvider?.resolve !== 'function') return { status: 'unresolved', reason: 'quality evidence unavailable' };
      let active;
      try {
        const goal = get(contract.goalId);
        active = selectQualityProfile(qualityPolicy, { projectId: seed.projectId, goal: clone(goal),
          pins: current, boundary: effectiveBoundary(contract.goalId) });
      } catch { return { status: 'unresolved', reason: 'quality policy selection failed' }; }
      if (!sameQualityProfile(active, contract.qualityProfile))
        return { status: 'stale', reason: 'quality profile revision changed' };
    }
    return null;
}

function makeCompletion({ issuedContracts, seed, pinSet, get, referenceStatus, hasUnknown,
  acceptedProofs, evidenceProvider, nodes, qualityPolicy, qualityEvidenceProvider, effectiveBoundary }) {
  const validatedContract = contract => {
    if (!contract || !isText(contract.contractId) || !issuedContracts.has(contract.contractId) ||
      !isDeepStrictEqual(contract, issuedContracts.get(contract.contractId))) throw new Error('unknown or altered issued contract');
    if (contract.projectId !== seed.projectId) throw new Error('foreign project contract');
    return issuedContracts.get(contract.contractId);
  };
  const contractState = contract => {
    validatedContract(contract);
    const current = pinSet(contract.goalId);
    if (!isDeepStrictEqual(contract.pins, current) || get(contract.goalId).version !== contract.goalVersion) {
      return { status: 'stale', reason: 'relevant goal/relation revision changed' };
    }
    const refStatus = referenceStatus(current.map(p => p.id));
    if (refStatus === 'stale') return { status: 'stale', reason: 'cross-project source revision changed' };
    if (refStatus === 'unresolved' || hasUnknown(current.map(p => p.id))) return { status: 'unresolved', reason: 'unknown or unavailable dependency' };
    const quality = checkQualityContract({ contract, qualityPolicy, qualityEvidenceProvider,
      seed, get, current, effectiveBoundary });
    if (quality) return quality;
    return { status: 'current' };
  };
  const statusFor = id => {
    const proofs = acceptedProofs.get(id) ?? [];
    if (!proofs.length) return 'pending';
    const receipt = proofs.at(-1);
    const state = contractState(receipt.contract).status;
    if (state === 'stale') return 'needs-reverification';
    if (state === 'unresolved') return 'unresolved';
    if (evidenceProvider && typeof evidenceProvider.freshness === 'function') {
      let freshness;
      try { freshness = evidenceProvider.freshness(clone(receipt)); } catch { return 'unresolved'; }
      if (freshness === 'stale') return 'needs-reverification';
      if (freshness !== 'current') return 'unresolved';
    }
    if (receipt.quality && typeof qualityEvidenceProvider?.freshness === 'function') {
      let freshness;
      try { freshness = qualityEvidenceProvider.freshness(clone(receipt)); } catch { return 'unresolved'; }
      if (freshness === 'stale') return 'needs-reverification';
      if (freshness !== 'current') return 'unresolved';
    }
    const children = [...nodes.values()].filter(n => n.parentId === id);
    const childStates = children.map(child => statusFor(child.id));
    if (childStates.includes('unresolved')) return 'unresolved';
    if (childStates.some(value => value !== 'completed')) return 'needs-reverification';
    return 'completed';
  };
  return { validatedContract, contractState, statusFor };
}

function makeAuthorization(seed, decisionGate) {
  const authorizeMapDecision = ({ actor, decision, before, kind }) => {
    if (!decision || !['two-way','one-way'].includes(decision.door) ||
        !['local','project'].includes(decision.blastRadius) ||
        !['high','low','unknown'].includes(decision.evidenceConfidence)) throw new Error('invalid decision risk');
    if (decision.door === 'two-way' && decision.blastRadius === 'local' && decision.evidenceConfidence === 'high') return null;
    if (typeof decisionGate !== 'function') throw new Error('independent decision gate required');
    const review = decisionGate(clone({ projectId: seed.projectId, actor, kind, before, decision }));
    if (!review || review.accepted !== true || !isText(review.receipt)) throw new Error('decision gate rejected');
    if (decision.door === 'one-way' && decision.blastRadius === 'project' && review.humanApproved !== true)
      throw new Error('human approval required');
    return review;
  };
  return authorizeMapDecision;
}

export function createGraph({ seed, nodes, edges, references, issuedContracts, acceptedProofs,
  evidenceProvider, referenceResolver, decisionGate, candidates, acceptedKnowledge, qualityPolicy, qualityEvidenceProvider }) {
  const topology = makeTopology(nodes);
  const pins = makePins({ ...topology, edges });
  const refs = makeReferences({ seed, ...topology, referenceResolver, references });
  const completion = makeCompletion({ ...topology, ...pins, ...refs, issuedContracts,
    seed, acceptedProofs, evidenceProvider, nodes, qualityPolicy, qualityEvidenceProvider });
  const context = makeContext({ seed, ...topology, ...pins, nodes, edges, references,
    candidates, acceptedKnowledge, statusFor: completion.statusFor });
  return { ...topology, ...pins, ...refs, ...completion, context,
    authorizeMapDecision: makeAuthorization(seed, decisionGate) };
}
