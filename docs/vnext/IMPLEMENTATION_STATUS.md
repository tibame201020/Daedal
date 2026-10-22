# Implementation status — Daedal vNext

Date: 2026-10-22. PR #1 now includes **VS1–VS3 in-memory contract tests**, not a deployable Knossos, trusted attestation system or full Minimum Complete Daedal. Original Ikaros protocol, v2 tracker schema and CI templates are unchanged.

## Implemented

- Recursive project-scoped Goals, inherited allow/deny capabilities, mandatory navigation independent of optional retrieval.
- Revision transaction with CAS, prior-version history, host-injected decision gate, scoped dependency/composition pins.
- Work Contracts are internally registered and checked for alteration; their enforcement status remains **advisory**, not bearer authorization.
- VS3 `verifyGoal({ contract, evidenceRefs })`: accepts *references only*; a host-supplied synchronous Evidence Provider resolves artifact and test records containing matching project/goal/issued contract, source revision, verified result, implementer identity, immutable source URI and SHA-256 digest.
- Host-supplied Independent Verifier sees the real-source references, Goal and relevant subgraph; must provide an independent reviewer identity, version-bound verdict, code/boundary review and one reviewed result for every acceptance criterion.
- Only a valid PASS produces a defensive-copy proof and derived `completed` state. A FAIL cannot complete a Goal. Parent must first have completed children and then pass its **own** integration acceptance. After relevant changes, old proof remains available, but effective state becomes `needs-reverification`; unrelated siblings remain completed.
- Rechecks revision freshness after provider/verifier callbacks, preventing a stale in-process review from committing. Replay and altered contracts are rejected.
- Node 22 `npm test` runs original 13 plus VS3 regressions in `test/verification.test.mjs`. All fixtures use fictional references and roles, not real user identifiers or secrets.

## Explicit trust boundary / not implemented

- These are **port contracts with synthetic test doubles**. A JavaScript callback is not authentication, a `verified: true` record is not independent proof unless its host adapter genuinely verifies the original artifact, and a `codeReviewed` boolean does not substitute for actual code inspection. Agent-facing tools must not control or replace constructor-injected ports.
- No production Evidence Provider, authenticated reviewer identity, human approval attestation, durable immutable receipts, live Code/Spec semantic reviewer, protected write interception, real hosted Knossos, persistence, RAG, or multi-project Live Reference resolver.
- Issued contract IDs correlate in-process snapshots; they are not authorization tokens. State/proofs disappear on process restart. The public `verifyGoal` must only be exposed by a trusted host with authenticated access.
- No migration, release or merge. VS4 and VS5 are still pending.

## Next

VS4: test a genuinely protected tool seam with advisory/enforced capability negotiation, authenticated evidence and an independent code/spec reviewer examining real source, not only synthetic capability tags. VS5: persistence, cross-project read-only versioned references and one real end-to-end Goal lifecycle. Retain full TDD + GitHub Actions and adjust docs with each accepted change.
