# Daedal vNext — Review Findings Remediation (2026-10-27)

Source: PR #1 Code/Spec drift review comment [6436476760](https://github.com/tibame201020/Daedal/pull/1#issuecomment-6436476760). Baseline: `d5c08f4b562f7ff60e69f2a4327a446f0ecc4332`.

## Scope

This corrects existing Domain and Evidence contracts. No new orchestration, Paperclip native Issue management, Browser Harness provider specialization or changed product architecture.

| Finding | Root cause | Contract-preserving correction | RED test |
|---|---|---|---|
| P1-1 Q13/Q17/Q22 | Cross-project reference hashed the selected source Goal and ancestors, but omitted descendant versions within its Surface | `inspectReference` adds deterministic sorted descendant ID/content/composition revision pins. Changes inside the selected Surface invalidate consumer contracts; unrelated siblings do not | `drift-review.test.mjs`: descendant acceptance vs sibling |
| P1-2 Q11 | Navigation projected ancestor boundary but discarded accepted ancestor acceptance/decision history | Navigation includes ancestor `acceptance` and `acceptedDecisions` scoped to the Goal and lineage; retrieved RAG remains candidate-only | `drift-review.test.mjs`: mandatory inherited acceptance/decision |
| P1-3 Q19/Q21 | Quality and graph were rechecked after reviewer callback, but originating artifact/test freshness was only checked **after** writing the proof | When the trusted source provider offers `freshness`, call it with the candidate receipt **before** proof insertion; `stale`/unavailable or provider errors fail closed | `drift-review.test.mjs`: stale during review and provider offline |
| P2-4 PR review state | Aggregator scanned all reviews without collapsing superseded actions per reviewer | Reduce to latest actionable APPROVED / CHANGES_REQUESTED / DISMISSED by submitted time and GitHub numeric review ID for same-second tie; ambiguous history UNKNOWN. Different reviewers remain independent | `drift-review.test.mjs`: superseded approvals, dismissal, conflicting reviewers |

## Explicit limits

- Reference projection schema now includes the **relevant descendant subgraph**; existing draft experimental reference pins may become stale and need a reviewed refresh. This is selective invalidation, not a global Project reset.
- **No cryptographic evidence freshness is invented.** If an evidence provider lacks a trustworthy `freshness` capability, this domain library cannot by itself guarantee external file contents remained unchanged during review. Deployment must require an origin-checking provider and authenticated independent reviewer.
- PR aggregation consumes **host-normalized GitHub review history**; the tool caller must obtain actual review records and verify reviewer identity. The function does not authenticate arbitrary JSON.
- The earlier native quality source identity gap remains separate: local single-artifact SHA-256 vs Git commit SHA (and GitHub Actions PR merge SHA). Do not promote local JSON to verified native quality evidence without a trusted source/artifact/commit mapping and run attestation.
- Genuine isolated multi-agent semantic review was not demonstrated; a single-reviewer code inspection and new TDD regressions are **not** a substitute.
- Original `protocol/`, `labyrinth/` and external native lifecycles remain unchanged. PR remains DRAFT until independent Production Acceptance.

## Verification protocol

First execute the new negative tests at baseline (expected 4/4 FAIL); then fix and execute the same tests (PASS); finally run the complete Node test suite with CI line/branch/function coverage thresholds and Ikaros source-size tests. Treat a GitHub Actions success as evidence of execution, not an independent Code/Spec sign-off. Reviewers should verify the current branch SHA, original diff and test log before any approval.
