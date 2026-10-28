import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { clone, sorted, isText, requireText, validateBoundary, validateGoal } from './labyrinth-common.mjs';
import { restoreSnapshot } from './labyrinth-snapshot.mjs';
import { createGraph } from './labyrinth-graph.mjs';
import { verifyGoal } from './labyrinth-verification.mjs';
import { attachReference, refreshReference } from './labyrinth-references.mjs';
import { discover, acceptDiscovery } from './labyrinth-knowledge.mjs';
import { decompose, relate, reviseGoal } from './labyrinth-mutations.mjs';
import { selectQualityProfile } from './quality-review.mjs';

/** Daedal vNext vertical slice: project-scoped goals, context, revision pinning.
 * Pure in-memory domain module; not a persistent service or an attested enforcement adapter.
 */

function initializeRuntime(seed, { decisionGate, evidenceProvider, independentVerifier, referenceResolver, knowledgeVerifier, qualityPolicy, qualityEvidenceProvider, initialSnapshot } = {}) {
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
  const candidates = new Map();
  const acceptedKnowledge = new Map();
  const graph = createGraph({ seed, nodes, edges, references, issuedContracts, acceptedProofs,
    evidenceProvider, referenceResolver, decisionGate, candidates, acceptedKnowledge, qualityPolicy, qualityEvidenceProvider, changes });

  if (initialSnapshot !== undefined) restoreSnapshot({
    initialSnapshot, seed, root, bootstrapSeed, nodes, edges, references, past, changes,
    issuedContracts, acceptedProofs, candidates, acceptedKnowledge
  });
  return { seed, root, bootstrapSeed, nodes, edges, past, changes, issuedContracts, acceptedProofs,
    references, candidates, acceptedKnowledge, graph, decisionGate, evidenceProvider,
    independentVerifier, knowledgeVerifier, qualityPolicy, qualityEvidenceProvider };
}

function issueWorkContract(id, { get, pinSet, effectiveBoundary, issuedContracts, seed, qualityPolicy }) {
  const node = get(id); const pins = pinSet(id);
  const boundary = effectiveBoundary(id);
  const qualityProfile = selectQualityProfile(qualityPolicy, { projectId: seed.projectId,
    goal: clone(node), pins: clone(pins), boundary });
  const contract = { contractId: randomUUID(), projectId: seed.projectId, goalId: id, goalVersion: node.version,
    pins, boundary, enforcement: 'advisory', issuedFor: 'domain-navigation',
    ...(qualityProfile ? { qualityProfile } : {}) };
  issuedContracts.set(contract.contractId, clone(contract));
  return clone(contract);
}

function createFacade({ seed, root, bootstrapSeed, nodes, edges, past, changes,
  issuedContracts, acceptedProofs, references, candidates, acceptedKnowledge, graph,
  decisionGate, evidenceProvider, independentVerifier, knowledgeVerifier, qualityPolicy, qualityEvidenceProvider }) {
  const { get, effectiveBoundary, validateChildBoundary, pinSet, inspectReference, liveReference, context,
    validatedContract, contractState, statusFor, authorizeMapDecision } = graph;
  return {
    projectId: seed.projectId,
    inspectReference(id) { return clone(inspectReference(id)); },
    attachReference(args) {
      return attachReference(args, { get, seed, references, liveReference, past, nodes, changes });
    },
    refreshReference(args) {
      return refreshReference(args, { get, references, seed, liveReference, decisionGate,
        context, past, nodes, changes });
    },
    exportSnapshot() {
      // Trusted host only: this contains pending contracts and proof metadata, not an agent-facing export.
      return clone({ schemaVersion: 2, projectId: seed.projectId, rootId: root.id, bootstrapSeed: clone(bootstrapSeed),
        nodes: [...nodes.values()], edges, references, candidates: [...candidates], acceptedKnowledge: [...acceptedKnowledge],
        past: [...past], changes, issuedContracts: [...issuedContracts], acceptedProofs: [...acceptedProofs] });
    },
    decompose(args) { return decompose(args, { nodes, get, authorizeMapDecision, validateChildBoundary, past, changes }); },
    relate(args) { return relate(args, { nodes, get, authorizeMapDecision, edges, past, changes }); },
    discover(args) { return discover(args, { get, candidates }); },
    acceptDiscovery(args) {
      return acceptDiscovery(args, { candidates, acceptedKnowledge, get, knowledgeVerifier,
        cloneGate: authorizeMapDecision, edges, past, nodes, changes });
    },
    navigate(id, { retrieved = [] } = {}) {
      if (!Array.isArray(retrieved)) throw new Error('retrieved must be an array');
      return { ...context(id), retrieved: clone(retrieved).map(x => ({ ...x, authority: 'candidate-only' })) };
    },
    checkCapability(id, capability) {
      const b = effectiveBoundary(id);
      return { allowed: b.allow.includes(capability) && !b.deny.includes(capability), capability, boundary: b };
    },
    issueContract(id) { return issueWorkContract(id, { get, pinSet, effectiveBoundary, issuedContracts, seed, qualityPolicy }); },
    contractStatus(contract) {
      return contractState(contract);
    },
    verifyGoal(args) {
      return verifyGoal(args, { validatedContract, evidenceProvider, independentVerifier,
        contractState, statusFor, nodes, seed, context, acceptedProofs, qualityEvidenceProvider });
    },
    proofs(id) { get(id); return clone(acceptedProofs.get(id) ?? []); },
    reviseGoal(args) { return reviseGoal(args, { get, validateChildBoundary, effectiveBoundary, decisionGate, seed, context, past, nodes, changes }); },
    history(id) { get(id); return clone(past.get(id)); },
    revisions() { return clone(changes); },
  };
}

export function createLabyrinth(seed, options = {}) {
  return createFacade(initializeRuntime(seed, options));
}
