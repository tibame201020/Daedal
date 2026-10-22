# Domain Contract & Code Review Closeout — 2026-10-23

Status: implementation refinement of original Daedal vNext; **not** a production authentication or external semantic-review acceptance.

## Effective map transitions

- `decompose`: actor, Decision Risk, expected **parent Goal content revision** and expected **parent composition revision**. Recheck both after host decision callbacks. Parent keeps original acceptance; child inherits inherited capabilities and can only narrow them.
- `relate`: actor, Decision Risk and CAS of source Goal revision; recheck after host callback. Every accepted relation update produces a typed revision receipt, not a silent edge mutation.
- `reviseGoal`: prior behavior retained, with typed `revise-goal` receipt and post-decision CAS check. Acceptance changes still require independent gate.
- Higher-risk/one-way modifications require host-injected Decision Gate; callers cannot install a per-operation approval callback. This local library does **not authenticate host identity**.
- Existing tests now use a dedicated fixture helper to submit actual revision proposals, rather than relying on a hidden legacy bypass.

## Discovery authority

- `discover` creates a **non-authoritative candidate** with source URI, source revision, SHA-256 digest and claim. It does not alter effective dependency edges.
- `acceptDiscovery` requires an independently host-verified provenance result bound to the candidate's original revision/digest and a reviewer distinct from the implementation actor, plus explicit Actor / expected Goal revision / Decision Risk. The accepted relation, knowledge index, reviewer receipt and Revision record are committed together; stale or duplicate acceptance fails closed.
- Trusted-host providers must actually resolve and verify the cited source. Fixture receipts alone do not establish production authenticity.
- Manually authored `relate` is an explicit normative decision path, distinct from RAG-derived knowledge; its actor/decision transport still requires production authentication.

## Persistence compatibility

Snapshot schema is now **2** because Candidate and Accepted Knowledge indexes and the audit record are present. Restoring malformed accepted entries, entries without their effective relation, or incompatible experimental schema-1 snapshots fails closed. No implicit migration or historical PASS promotion. Original Daedal v2 tracker/protocol/workflows are not changed.

## Code structure and quality

- The public `labyrinth.mjs` is a thin entrypoint for original Domain responsibilities: graph/navigation, mutation, knowledge, references, evidence, persistence.
- Original Ikaros thresholds of <=300 lines per source module and <=50 lines per declared top-level function are automatically regression-tested by `test/source-shape.test.mjs`. The repository's existing original protocol files are not rewritten.
- `createFileSnapshotStore.read()` exposes a frozen query-only interface; state changes go through CAS `transact()`.
- The Node runner now enforces at least **80% line, branch and function coverage** in `npm test`, which GitHub Actions already invokes.

## Remaining distinct product/deployment gates

Authenticated callers/approvers/reviewers, real external source-provenance attestation, model or human independent semantic Code/Spec QC, OS-level write isolation, native Paperclip/Browser Harness E2E, durable backup/restore and explicit original-v2 migration acceptance are separate from this local Domain Contract closeout. Do not treat synthetic test review as external product acceptance or automatically merge/release.
