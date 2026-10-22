import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

/** Daedal vNext vertical slice: project-scoped goals, context, revision pinning.
 * Pure in-memory domain module; not a persistent service or an attested enforcement adapter.
 */
const clone = (value) => structuredClone(value);
const sorted = (values) => [...new Set(values)].sort();
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
function requireText(value, label) {
  if (!isText(value)) throw new Error(`${label} must be non-empty`);
}
function strings(value, label, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && !value.length) || !value.every(isText)) {
    throw new Error(`${label} must be ${nonempty ? 'a nonempty' : 'an'} array of strings`);
  }
  return sorted(value);
}
function validateBoundary(boundary = {}) {
  const allow = strings(boundary.allow ?? [], 'boundary.allow');
  const deny = strings(boundary.deny ?? [], 'boundary.deny');
  if (allow.some(x => deny.includes(x))) throw new Error('boundary allow/deny conflict');
  return { allow, deny };
}
function validateGoal({ id, outcome, acceptance, boundary = {} }) {
  requireText(id, 'goal id'); requireText(outcome, 'goal outcome');
  return { id, outcome, acceptance: strings(acceptance, 'acceptance', true), boundary: validateBoundary(boundary) };
}

export function createLabyrinth(seed, { decisionGate, evidenceProvider, independentVerifier, referenceResolver, initialSnapshot } = {}) {
  requireText(seed.projectId, 'projectId');
  const bootstrapSeed = validateGoal(seed);
  const root = { ...bootstrapSeed, parentId: null, version: 1, compositionVersion: 1, status: 'pending' };
  const nodes = new Map([[root.id, root]]);
  const edges = [];
  const past = new Map([[root.id, []]]);
  const changes = [];
  const issuedContracts = new Map();
  const acceptedProofs = new Map();
  const references = [];
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
      pins: pinSet(id),
    };
  };
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
    const children = [...nodes.values()].filter(n => n.parentId === id);
    const childStates = children.map(child => statusFor(child.id));
    if (childStates.includes('unresolved')) return 'unresolved';
    if (childStates.some(value => value !== 'completed')) return 'needs-reverification';
    return 'completed';
  };
  const self = {
    projectId: seed.projectId,
    inspectReference(id) { return clone(inspectReference(id)); },
    attachReference({ fromId, sourceProjectId, sourceGoalId, expectedVersion, actor }) {
      const current = get(fromId); requireText(actor, 'actor');
      if (expectedVersion !== current.version) throw new Error('version conflict');
      requireText(sourceProjectId, 'source project'); requireText(sourceGoalId, 'source goal');
      if (sourceProjectId === seed.projectId) throw new Error('external project reference only');
      if (references.some(r => r.fromId === fromId && r.sourceProjectId === sourceProjectId && r.sourceGoalId === sourceGoalId)) throw new Error('duplicate project reference');
      const live = liveReference({ sourceProjectId, sourceGoalId, revision: null });
      if (live.status === 'unresolved') throw new Error('external source unavailable');
      const link = { fromId, sourceProjectId, sourceGoalId, revision: live.source.revision, type: 'live-reference' };
      references.push(link);
      past.get(fromId).push(clone(current)); nodes.set(fromId, { ...current, version: current.version + 1 });
      changes.push({ id: fromId, actor, type: 'attach-reference', beforeVersion: current.version, afterVersion: current.version + 1,
        sourceProjectId, sourceGoalId, revision: link.revision });
      return clone(link);
    },
    refreshReference({ fromId, sourceProjectId, sourceGoalId, expectedVersion, expectedRevision, actor, decision }) {
      const current = get(fromId); requireText(actor, 'actor');
      if (expectedVersion !== current.version) throw new Error('version conflict');
      const link = references.find(r => r.fromId === fromId && r.sourceProjectId === sourceProjectId && r.sourceGoalId === sourceGoalId);
      if (!link) throw new Error('unknown project reference');
      if (expectedRevision !== link.revision) throw new Error('source revision conflict');
      if (!decision || !['two-way', 'one-way'].includes(decision.door) ||
          !['local', 'project'].includes(decision.blastRadius) ||
          !['high', 'low', 'unknown'].includes(decision.evidenceConfidence)) throw new Error('invalid decision risk');
      const live = liveReference(link);
      if (live.status === 'unresolved') throw new Error('external source unavailable');
      if (live.status === 'current') throw new Error('source reference already current');
      const after = { ...link, revision: live.source.revision };
      const needsGate = decision.door === 'one-way' || decision.blastRadius !== 'local' || decision.evidenceConfidence !== 'high';
      if (needsGate) {
        if (typeof decisionGate !== 'function') throw new Error('independent decision gate required');
        const review = decisionGate(clone({ projectId: seed.projectId, actor, decision, before: link, after, parent: current.parentId ? context(current.parentId) : null }));
        if (!review || review.accepted !== true || !isText(review.receipt)) throw new Error('decision gate rejected');
        if (decision.door === 'one-way' && decision.blastRadius === 'project' && review.humanApproved !== true) throw new Error('human approval required');
      }
      // The resolver or decision callback may have changed the source or current map synchronously.
      if (get(fromId).version !== expectedVersion || link.revision !== expectedRevision ||
          liveReference(after).status !== 'current') throw new Error('reference became stale during decision');
      const old = clone(current);
      past.get(fromId).push(old);
      Object.assign(link, after);
      nodes.set(fromId, { ...current, version: current.version + 1 });
      changes.push({ id: fromId, actor, type: 'refresh-reference', beforeVersion: current.version, afterVersion: current.version + 1,
        sourceProjectId, sourceGoalId, beforeRevision: expectedRevision, revision: after.revision, decision });
      return clone(link);
    },
    exportSnapshot() {
      // Trusted host only: this contains pending contracts and proof metadata, not an agent-facing export.
      return clone({ schemaVersion: 1, projectId: seed.projectId, rootId: root.id, bootstrapSeed: clone(bootstrapSeed),
        nodes: [...nodes.values()], edges, references,
        past: [...past], changes, issuedContracts: [...issuedContracts], acceptedProofs: [...acceptedProofs] });
    },
    decompose({ id, parentId, outcome, acceptance, boundary }) {
      if (nodes.has(id)) throw new Error(`duplicate goal: ${id}`);
      if (!nodes.has(parentId)) throw new Error(`unknown parent: ${parentId}`);
      const child = { ...validateGoal({ id, outcome, acceptance, boundary: validateChildBoundary(parentId, boundary) }), parentId, version: 1, compositionVersion: 1, status: 'pending' };
      nodes.set(id, child); past.set(id, []);
      // Parent's assembled acceptance may now include the new child.
      const parent = get(parentId); past.get(parentId).push(clone(parent));
      nodes.set(parentId, { ...parent, compositionVersion: parent.compositionVersion + 1 });
      return clone(child);
    },
    relate({ fromId, toId, type }) {
      get(fromId); get(toId);
      if (fromId === toId) throw new Error('self relation');
      if (!['depends_on', 'unknown'].includes(type)) throw new Error('unsupported relation type');
      if (edges.some(e => e.fromId === fromId && e.toId === toId)) throw new Error('duplicate relation');
      edges.push({ fromId, toId, type });
      const from = get(fromId); past.get(fromId).push(clone(from));
      nodes.set(fromId, { ...from, version: from.version + 1 });
    },
    navigate(id, { retrieved = [] } = {}) {
      if (!Array.isArray(retrieved)) throw new Error('retrieved must be an array');
      return { ...context(id), retrieved: clone(retrieved).map(x => ({ ...x, authority: 'candidate-only' })) };
    },
    checkCapability(id, capability) {
      const b = effectiveBoundary(id);
      return { allowed: b.allow.includes(capability) && !b.deny.includes(capability), capability, boundary: b };
    },
    issueContract(id) {
      const node = get(id); const pins = pinSet(id);
      const contract = { contractId: randomUUID(), projectId: seed.projectId, goalId: id, goalVersion: node.version,
        pins, boundary: effectiveBoundary(id), enforcement: 'advisory', issuedFor: 'domain-navigation' };
      issuedContracts.set(contract.contractId, clone(contract));
      return clone(contract);
    },
    contractStatus(contract) {
      return contractState(contract);
    },
    verifyGoal({ contract, evidenceRefs }) {
      // This synchronous domain seam must only be invoked by a trusted host. It is not an auth boundary.
      validatedContract(contract);
      if (!evidenceProvider || typeof evidenceProvider.resolve !== 'function' ||
          !independentVerifier || typeof independentVerifier.review !== 'function') {
        throw new Error('trusted evidence provider and independent verifier required');
      }
      const current = contractState(contract);
      if (current.status !== 'current') throw new Error(current.status + ' contract cannot be verified');
      if (statusFor(contract.goalId) === 'completed') throw new Error('goal already completed');
      const children = [...nodes.values()].filter(n => n.parentId === contract.goalId);
      if (children.some(n => statusFor(n.id) !== 'completed')) throw new Error('child goal not completed');
      if (!Array.isArray(evidenceRefs) || evidenceRefs.length < 2 ||
          !evidenceRefs.every(isText) || new Set(evidenceRefs).size !== evidenceRefs.length) {
        throw new Error('evidence references must be distinct strings');
      }
      const evidence = evidenceRefs.map(reference => {
        const record = evidenceProvider.resolve(reference, clone({ contract, context: context(contract.goalId) }));
        if (!record || record.reference !== reference || record.verified !== true || record.passed !== true ||
            !['artifact', 'test'].includes(record.kind) || !isText(record.sourceUri) ||
            !/^[a-f0-9]{64}$/i.test(record.sha256 ?? '') || !isText(record.sourceRevision) ||
            !isText(record.implementerId) || record.projectId !== seed.projectId ||
            record.goalId !== contract.goalId || record.contractId !== contract.contractId) {
          throw new Error('unverifiable evidence or evidence scope mismatch');
        }
        return clone(record);
      });
      if (!evidence.some(e => e.kind === 'artifact') || !evidence.some(e => e.kind === 'test') ||
          new Set(evidence.map(e => e.sourceRevision)).size !== 1 ||
          new Set(evidence.map(e => e.implementerId)).size !== 1) throw new Error('evidence must align to the same implementation revision and actor');
      const contextSnapshot = context(contract.goalId);
      const subject = { contractId: contract.contractId, goalVersion: contract.goalVersion,
        pins: contract.pins, sourceRevision: evidence[0].sourceRevision };
      const review = independentVerifier.review(clone({ contract, context: contextSnapshot, sources: evidence, subject }));
      if (!review || !isText(review.reviewerId) || review.reviewerId === evidence[0].implementerId ||
          !isText(review.reviewReceipt) || !isDeepStrictEqual(review.subject, subject) ||
          review.codeReviewed !== true || review.boundaryReviewed !== true ||
          !['pass', 'fail'].includes(review.verdict) || !Array.isArray(review.criterionResults) ||
          !isDeepStrictEqual(sorted(review.criterionResults.map(c => c.criterion)), contextSnapshot.acceptance) ||
          review.criterionResults.length !== contextSnapshot.acceptance.length ||
          review.criterionResults.some(c => typeof c.passed !== 'boolean') ||
          (review.verdict === 'pass' && review.criterionResults.some(c => !c.passed))) {
        throw new Error('invalid independent verdict or incomplete review');
      }
      // Recheck after host callbacks: an in-process callback can mutate the graph synchronously.
      if (contractState(contract).status !== 'current' || children.some(n => statusFor(n.id) !== 'completed') ||
          statusFor(contract.goalId) === 'completed') throw new Error('verification became stale during review');
      if (review.verdict === 'fail') return { verdict: 'fail', goalState: statusFor(contract.goalId),
        findings: clone(review.findings ?? []) };
      const receipt = { projectId: seed.projectId, goalId: contract.goalId, contract: clone(contract),
        sources: evidence.map(({ reference, kind, sourceUri, sha256, sourceRevision, testSourceSha256 }) =>
          ({ reference, kind, sourceUri, sha256, sourceRevision,
            ...(testSourceSha256 ? { testSourceSha256 } : {}) })),
        implementerId: evidence[0].implementerId, reviewerId: review.reviewerId, reviewReceipt: review.reviewReceipt,
        criterionResults: clone(review.criterionResults), verdict: 'pass' };
      const proofs = acceptedProofs.get(contract.goalId) ?? [];
      proofs.push(clone(receipt)); acceptedProofs.set(contract.goalId, proofs);
      return { verdict: 'pass', goalState: statusFor(contract.goalId), receipt: clone(receipt) };
    },
    proofs(id) { get(id); return clone(acceptedProofs.get(id) ?? []); },
    reviseGoal(proposal) {
      const { id, expectedVersion, actor, change, decision } = proposal;
      const old = get(id); requireText(actor, 'actor');
      if (old.version !== expectedVersion) throw new Error('version conflict');
      if (!change || Object.keys(change).length === 0 || Object.keys(change).some(x => !['outcome', 'acceptance', 'boundary'].includes(x))) throw new Error('unsupported or empty goal change');
      if (!decision || !['two-way', 'one-way'].includes(decision.door) || !['local', 'project'].includes(decision.blastRadius) || !['high', 'low', 'unknown'].includes(decision.evidenceConfidence)) throw new Error('invalid decision risk');
      const updated = { ...clone(old), ...clone(change), version: old.version + 1 };
      if ('boundary' in change) updated.boundary = old.parentId
        ? validateChildBoundary(old.parentId, change.boundary) : validateBoundary(change.boundary);
      const validated = validateGoal(updated);
      updated.acceptance = validated.acceptance;
      const acceptanceChanged = 'acceptance' in change;
      const boundaryWidened = 'boundary' in change && updated.boundary.allow.some(x => !effectiveBoundary(id).allow.includes(x));
      const needsGate = acceptanceChanged || boundaryWidened || decision.door === 'one-way' || decision.blastRadius !== 'local' || decision.evidenceConfidence !== 'high';
      let review = null;
      if (needsGate) {
        if (typeof decisionGate !== 'function') throw new Error('independent decision gate required');
        // Caller must supply an authenticated gate; this in-memory module does not authenticate reviewers.
        review = decisionGate(clone({ projectId: seed.projectId, proposal, before: old, after: updated, parent: old.parentId ? context(old.parentId) : null }));
        if (!review || review.accepted !== true || !isText(review.receipt)) throw new Error('decision gate rejected');
        if (acceptanceChanged && (!isText(review.reviewer) || review.reviewer === actor)) throw new Error('independent reviewer required');
        if (decision.door === 'one-way' && decision.blastRadius === 'project' && review.humanApproved !== true) throw new Error('human approval required');
      }
      // All checks above precede the one effective state mutation.
      past.get(id).push(clone(old)); nodes.set(id, updated);
      changes.push(clone({ id, actor, beforeVersion: old.version, afterVersion: updated.version, decision, gateReceipt: review?.receipt ?? null }));
      return clone(updated);
    },
    history(id) { get(id); return clone(past.get(id)); },
    revisions() { return clone(changes); },
  };
  if (initialSnapshot !== undefined) {
    const state = clone(initialSnapshot);
    if (!state || state.schemaVersion !== 1 || state.projectId !== seed.projectId || state.rootId !== root.id ||
        !isDeepStrictEqual(state.bootstrapSeed, bootstrapSeed) ||
        !Array.isArray(state.nodes) || !Array.isArray(state.edges) || !Array.isArray(state.references) ||
        !Array.isArray(state.past) || !Array.isArray(state.changes) || !Array.isArray(state.issuedContracts) ||
        !Array.isArray(state.acceptedProofs)) throw new Error('invalid snapshot identity or schema');
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
    nodes.clear(); for (const [id,n] of restored) nodes.set(id,n);
    edges.push(...state.edges); references.push(...state.references);
    past.clear(); for (const [id,rows] of history) past.set(id,rows);
    changes.push(...state.changes);
    for (const [id,c] of contracts) issuedContracts.set(id,c);
    for (const [id,p] of proofs) acceptedProofs.set(id,p);
  }
  return self;
}
