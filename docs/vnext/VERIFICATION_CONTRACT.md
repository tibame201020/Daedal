# VS3: Evidence and Independent Verification Contract

This is a **synchronous in-memory domain seam**, not an implementation of an authenticated remote host.

```js
const labyrinth = createLabyrinth(seed, {
  decisionGate, // existing, trusted host-only risk/acceptance decision port
  evidenceProvider: { resolve(reference, { contract, context }) { /* inspect actual source */ } },
  independentVerifier: { review({ contract, context, sources, subject }) { /* independently inspect */ } }
});
const contract = labyrinth.issueContract('feature');
const result = labyrinth.verifyGoal({
  contract,
  evidenceRefs: ['artifact-reference', 'test-reference']
});
```

## Required trusted host behavior

- Never expose port construction or arbitrary callback injection to an untrusted Agent; the Agent proposes source **references**, not self-authenticated source records or its own verdict.
- Evidence Provider reads actual immutable origin (code/diff and test results), verifies source identity, SHA-256 content digest, projectId, goalId, contractId, implementation actor, source revision, `verified: true` and `passed: true`. This module validates returned shape and consistency but **cannot attest that a host callback told the truth**.
- At least two distinct references of `kind: 'artifact'` and `kind: 'test'`, from the same implementation revision and actor. For non-code products, a future explicitly agreed acceptance-specific requirement policy is needed; do not pretend this software-first seam covers every kind of work.
- Independent Verifier receives accepted Goal, ancestors/boundary, acceptance, related version pins and resolved origin metadata. Its authenticated identity must differ from the originating implementation actor. Report must pin the exact subject (`contractId`, `goalVersion`, `pins`, `sourceRevision`), include a resolvable `reviewReceipt`, `codeReviewed: true`, `boundaryReviewed: true`, all acceptance criteria once, and pass/fail.
- A green test with semantic or architectural scope drift must produce a FAIL from the independent Verifier; structure checks alone cannot discover this.
- The domain rechecks freshness after callbacks. A successful verdict appends a defensive-copy proof; failure/unknown/stale never completes Goal. No direct `completeGoal` method exists.
- A completed parent needs its own source evidence and verdict, **after** children complete. Related goal/composition revision changes make old proof history non-current without wiping unrelated proof.

## Security / lifecycle limits

`contractId` is a snapshot correlation ID, **not a credential**. Source URI and SHA-256 metadata are only meaningful when the Evidence Provider genuinely validates them; this test seam has fake fixtures, not live GitHub/Queqiao audit receipts. Host authentication, storage, origin authorization, retry/idempotency across process restarts and executable tool interception remain VS4/VS5 responsibilities. Do not store personal details, credentials, full private source or unsanitized logs in Daedal fixtures.
