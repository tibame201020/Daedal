# Daedal vNext — Minimum Complete Daedal

Status: Accepted product baseline, **partially implemented** as of 2026-10-22. See [implementation status](IMPLEMENTATION_STATUS.md). This is an implementation clarification of original Daedal, not a different product.

## Purpose

Daedal is a protocol for ensuring autonomous engineering work stays connected to project intent and is verifiably complete. Its original roles remain: Daedal specifies; Labyrinth holds a project-scoped map; Knossos independently navigates and verifies; Ikaros is any conforming working Agent. GitHub CI, Skills, tool adapters and RAG assist, but do not become the product definition.

## Normative invariants

1. Each Project owns an independent Goal scope; cross-project integration is itself a Project. References carry source versions and no write authority.
2. A Point and Surface are the same recursive Goal at different scales. Each Goal has one structural parent, no structural cycles, and its own acceptance.
3. Child Goals inherit all ancestor boundaries and may narrow, not bypass, them.
4. Observed implementation, inferred knowledge, and accepted product intent are different authorities. Source conflict is reported; retrieval is never an implicit amendment.
5. Effective map change goes through an expected-version Revision Transaction with old-version preservation, risk/impact assessment and provenance.
6. Acceptance changes are distinct deltas and independently checked; a self-authored weakening cannot manufacture completion.
7. Mandatory navigation contains Goal, ancestors, inherited boundary, effective acceptance and relevant version pins regardless of optional RAG outcome.
8. Work Contract pins only relevant scope and dependencies; unrelated work remains valid after localized changes. Unknown impact is unresolved, not automatically safe.
9. Enforced mode requires a real intercepting adapter; otherwise the status must be Advisory.
10. Goal completion requires authenticated source evidence and an independent verdict against effective acceptance, actual code/tests and relevant subgraph. Parent completion is independently evaluated.
11. Daedal owns its Goal state, not an external system's native employee/Issue lifecycle.

## Required behavior / public seams

- Bootstrap: authorized Goal Seed, progressively discovered candidates with provenance and explicit unknowns.
- Graph: recursive Goal decomposition, typed traceable relationships and effective inherited boundaries.
- Navigate: fixed mandatory context plus optional retrieved candidates; ability to trace a Goal to the Project intent.
- Revise: transactional, version-checked changes; gate higher-risk changes and all acceptance revisions; calculate targeted impact.
- Work: issue a revision-pinned contract and detect current/stale/unresolved status; a later trusted adapter negotiates actual enforcement.
- Proof: origin-verifiable receipt and independent verifier, followed by explicit Goal state transition.
- Reconcile: preserve unaffected evidence and invalidate only affected contracts/proof.
- Interoperate: host/model/CI agnostic; do not reimplement existing testing, agent dispatch, Paperclip governance or Browser Harness.

## First delivery phases (TDD)

- **VS1**: Goal Seed, recursive decomposition, inherited capability constraints and mandatory navigation.
- **VS2**: Local revision transaction, scoped dependency pinning and staleness/unknown impact checks.
- **VS3**: Trusted Evidence Provider, independent verification and separate parent-completion tests.
- **VS4**: Real protected adapter enforcing-vs-advisory demonstration and semantic code/scope review.
- **VS5**: Persistence, cross-project versioned read-only references, complete real end-to-end lifecycle and migration decision.

## Regression fixtures

- Parallel Paperclip native Issue lifecycle creation is outside the declared adapter scope.
- Provider-specific implementation must not silently specialize a general Browser Harness interface.
- All children pass but parent integration not verified: parent remains pending.
- Native E2E acceptance cannot be secretly substituted with Mock PASS.
- Change to Goal A invalidates relevant A/consumer contract, not unrelated B.
- Unknown dependence never produces an asserted PASS.
- RAG omission does not hide mandatory ancestor boundaries.
- Green unit tests plus scope-violating code must fail independent review.
- Missing/forged/stale evidence or self-verification cannot complete a Goal.
- Advisory adapter must not advertise interception/enforcement.

## Delivery constraints

Use a test-first public seam and run unit/contract tests in GitHub Actions. Store no personal identity, session, credential, private repo artifact, or unsanitized evidence in fixtures/receipts. Retain original v2 tracker/protocol/workflow until an explicit, verified migration. Do not call VS1/VS2 tests a complete independent verifier or production security boundary.
