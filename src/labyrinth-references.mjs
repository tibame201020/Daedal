import { clone, isText, requireText } from './labyrinth-common.mjs';

export function attachReference(args, { get, seed, references, liveReference, past, nodes, changes }) {
  const { fromId, sourceProjectId, sourceGoalId, expectedVersion, actor } = args;
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
}

export function refreshReference(args, { get, references, seed, liveReference,
  decisionGate, context, past, nodes, changes }) {
  const { fromId, sourceProjectId, sourceGoalId, expectedVersion, expectedRevision, actor, decision } = args;
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
}
