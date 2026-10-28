import { clone, isText, requireText, validateGoal, validateBoundary } from './labyrinth-common.mjs';

export function decompose(args, { nodes, get, authorizeMapDecision, validateChildBoundary, past, changes }) {
  const { id, parentId, outcome, acceptance, boundary, actor, expectedParentVersion, expectedCompositionVersion, decision } = args;
      if (!nodes.has(parentId)) throw new Error(`unknown parent: ${parentId}`);
      const parent = get(parentId); requireText(actor, 'actor');
      if (parent.version !== expectedParentVersion || parent.compositionVersion !== expectedCompositionVersion) throw new Error('version conflict');
      const review = authorizeMapDecision({ actor, decision, before: parent, kind: 'decompose' });
      if (get(parentId).version !== expectedParentVersion || get(parentId).compositionVersion !== expectedCompositionVersion) throw new Error('decomposition became stale during decision');
      if (nodes.has(id)) throw new Error(`duplicate goal: ${id}`);
      if (!nodes.has(parentId)) throw new Error(`unknown parent: ${parentId}`);
      const child = { ...validateGoal({ id, outcome, acceptance, boundary: validateChildBoundary(parentId, boundary) }), parentId, version: 1, compositionVersion: 1, status: 'pending' };
      nodes.set(id, child); past.set(id, []);
      // Parent's assembled acceptance may now include the new child.
      past.get(parentId).push(clone(parent));
      nodes.set(parentId, { ...parent, compositionVersion: parent.compositionVersion + 1 });
      changes.push(clone({ type: 'decompose', actor, id, parentId, beforeCompositionVersion: parent.compositionVersion,
        afterCompositionVersion: parent.compositionVersion + 1, decision, gateReceipt: review?.receipt ?? null }));
      return clone(child);
}

export function relate(args, { nodes, get, authorizeMapDecision, edges, past, changes }) {
  const { fromId, toId, type, expectedVersion, actor, decision } = args;
      const from = get(fromId); get(toId); requireText(actor, 'actor');
      if (from.version !== expectedVersion) throw new Error('version conflict');
      const review = authorizeMapDecision({ actor, decision, before: from, kind: 'relate' });
      if (get(fromId).version !== expectedVersion) throw new Error('relation became stale during decision');
      if (fromId === toId) throw new Error('self relation');
      if (!['depends_on', 'unknown'].includes(type)) throw new Error('unsupported relation type');
      if (edges.some(e => e.fromId === fromId && e.toId === toId)) throw new Error('duplicate relation');
      edges.push({ fromId, toId, type });
      past.get(fromId).push(clone(from));
      nodes.set(fromId, { ...from, version: from.version + 1 });
      changes.push(clone({ type: 'relate', actor, fromId, toId, relationType: type, beforeVersion: from.version,
        afterVersion: from.version + 1, decision, gateReceipt: review?.receipt ?? null }));
}

export function reviseGoal(args, { get, validateChildBoundary, effectiveBoundary, decisionGate, seed, context, past, nodes, changes }) {
  const proposal = args;
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
      if (get(id).version !== expectedVersion) throw new Error('goal became stale during decision');
      // All checks above precede the one effective state mutation.
      past.get(id).push(clone(old)); nodes.set(id, updated);
      changes.push(clone({ type: 'revise-goal', id, actor, beforeVersion: old.version, afterVersion: updated.version, decision, gateReceipt: review?.receipt ?? null }));
      return clone(updated);
}
