import { clone, isText, requireText } from './labyrinth-common.mjs';

export function discover(args, { get, candidates }) {
  const { id, fromId, toId, type, claim, source } = args;
      get(fromId); get(toId); requireText(id, 'candidate id'); requireText(claim, 'claim');
      if (candidates.has(id) || !['depends_on', 'unknown'].includes(type) ||
          !source || !isText(source.uri) || !isText(source.revision) || !/^[a-f0-9]{64}$/i.test(source.sha256 ?? ''))
        throw new Error('invalid or duplicate discovery source');
      const candidate = { id, fromId, toId, type, claim, source: clone(source), status: 'candidate' };
      candidates.set(id, clone(candidate));
      return clone(candidate);
}

export function acceptDiscovery(args, { candidates, acceptedKnowledge, get, knowledgeVerifier, cloneGate, edges,
  past, nodes, changes }) {
  const { id, actor, expectedVersion, decision } = args;
      const candidate = candidates.get(id);
      if (!candidate) throw new Error('unknown candidate');
      if (candidate.status !== 'candidate') throw new Error('already accepted');
      const from = get(candidate.fromId); requireText(actor, 'actor');
      if (from.version !== expectedVersion) throw new Error('version conflict');
      if (typeof knowledgeVerifier?.verify !== 'function') throw new Error('independent provenance verifier required');
      const review = knowledgeVerifier.verify(clone(candidate));
      if (!review || review.verified !== true || review.reviewerId === actor || !isText(review.reviewerId) ||
          !isText(review.receipt) || review.sourceRevision !== candidate.source.revision ||
          review.sourceSha256 !== candidate.source.sha256) throw new Error('independent provenance verification failed');
      const gate = cloneGate({ actor, decision, before: from, kind: 'accept-discovery' });
      if (get(candidate.fromId).version !== expectedVersion || candidates.get(id).status !== 'candidate')
        throw new Error('discovery became stale');
      if (edges.some(e => e.fromId === candidate.fromId && e.toId === candidate.toId))
        throw new Error('duplicate relation');
      edges.push({ fromId: candidate.fromId, toId: candidate.toId, type: candidate.type });
      past.get(from.id).push(clone(from));
      nodes.set(from.id, { ...from, version: from.version + 1 });
      const accepted = { ...clone(candidate), status: 'accepted', verificationReceipt: review.receipt,
        reviewerId: review.reviewerId };
      candidates.set(id, accepted);
      acceptedKnowledge.set(from.id, [...(acceptedKnowledge.get(from.id) ?? []), accepted]);
      changes.push(clone({ type: 'accept-discovery', actor, candidateId: id, fromId: from.id,
        beforeVersion: from.version, afterVersion: from.version + 1, decision, gateReceipt: gate?.receipt ?? null,
        provenanceReceipt: review.receipt }));
      return clone(accepted);
}
