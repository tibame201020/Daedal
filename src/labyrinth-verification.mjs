import { isDeepStrictEqual } from 'node:util';
import { clone, sorted, isText } from './labyrinth-common.mjs';

function resolveSources({ evidenceRefs, evidenceProvider, contract, seed, context }) {
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
      return evidence;
}
function reviewSources({ independentVerifier, context, contract, evidence }) {
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
      return { contextSnapshot, subject, review };
}
export function verifyGoal({ contract, evidenceRefs }, {
  validatedContract, evidenceProvider, independentVerifier, contractState, statusFor, nodes, seed,
  context, acceptedProofs
}) {
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
      const evidence = resolveSources({ evidenceRefs, evidenceProvider, contract, seed, context });
      const { contextSnapshot, subject, review } = reviewSources({ independentVerifier, context, contract, evidence });
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
}
