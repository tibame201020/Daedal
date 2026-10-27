# Risk-Adaptive Quality Evidence — Daedal vNext

Status: **implemented as a host-configurable contract + local file-backed evidence adapter**, not a deployed CRAP, mutation, pstack, or independent review service.

## Original Daedal responsibility

Daedal still owns the Goal, inherited boundaries, relevant graph, Work Contract and Independent Verification. Matt Pocock-style Standards/Spec review, PR Door/Blast Radius, code coverage, CRAP, mutation testing and pstack-like adversarial review are **methods that can emit evidence**. They do not gain authority to change a Goal, approve a PR or promote a PASS on their own.

There are **three independent concerns**:

1. **Review Profile** — A trusted host picks a versioned plan from Door Type, Blast Radius and Evidence Confidence. `createRiskAdaptiveQualityPolicy({assessRisk,profiles})` chooses low/medium/high; the host configures checks and numerical limits. Daedal hardcodes no CRAP or mutation threshold.
2. **Quality Evidence Provider** — A host-controlled port `resolve(checkId, {contract,sourceRevision,profile})` retrieves an original tool report or verified run receipt. Each entry binds check ID, check result, project/goal/issued Contract ID, code revision, Profile ID/version, tool/version, report URI and SHA-256.
3. **Quality Gate** — Before the independent Code/Spec verifier, Daedal evaluates all *required* checks: verified failure ⇒ **BLOCK**; missing, malformed, stale, offline, or unverified source ⇒ **UNKNOWN**; all required verified PASS ⇒ **PASS**. Advisory failures/missing reports are retained as warnings, not vetoes. Source/quality state is rechecked after the verifier callback before committing Goal proof.

Required quality success **does not replace** the independent evaluator's original `codeReviewed`, `boundaryReviewed`, acceptance-by-criterion verdict, or separate parent acceptance. A semantic violation still causes FAIL even if all numerical quality reports pass.

## Review Profile selection

A trusted host supplies `assessRisk`. The built-in **tier mapping** is simple: two-way/local/high-confidence ⇒ low; unknown confidence or one-way/project-wide ⇒ high; remaining combinations ⇒ medium. This selects *inspection intensity*, not authorization or a new risk model. All three profiles are explicit and versioned. Example check IDs such as `unit`, `integration`, `spec`, `standards`, `crap`, `mutation`, `pr`, `interrogate` are **opaque plugin names**, not special logic in Daedal.

```js
const qualityPolicy = createRiskAdaptiveQualityPolicy({
  assessRisk: goalAndContext => trustedHostRiskDecision(goalAndContext),
  profiles: {
    low: { id: 'local', version: '1', checks: [
      { id: 'unit', mode: 'required' }, { id: 'spec', mode: 'required' },
      { id: 'crap', mode: 'advisory' }] },
    medium: { id: 'module', version: '1', checks: [
      { id: 'unit', mode: 'required' }, { id: 'spec', mode: 'required' },
      { id: 'mutation', mode: 'required' }] },
    high: { id: 'critical', version: '1', checks: [
      { id: 'unit', mode: 'required' }, { id: 'spec', mode: 'required' },
      { id: 'mutation', mode: 'required' }, { id: 'interrogate', mode: 'required' }] },
  },
});
const map = createLabyrinth(seed, {
  evidenceProvider, independentVerifier, qualityPolicy, qualityEvidenceProvider,
});
```

This is a schematic: `trustedHostRiskDecision` is provided by the deploying host; this repository does not implement it as an authenticated service. `issueContract` pins the selected Profile to its issued Work Contract. Profile changes stale previously issued contracts and already completed proofs. Missing original policy/provider after restore makes a previously quality-pinned contract **unresolved**, not silently PASS.

## Local report demonstration

`createLocalQualityReportProvider({workspaceRoot,sourcePath,reportPaths})` reads **host-selected** JSON files and hashes their actual bytes and the selected code artifact. It refuses path traversal/symlinks in read paths and mismatched source digest, check ID, Project, Goal, issued Contract, code revision or Profile. Stored proof receipts include only report references/digests and tool metadata. The provider's optional `freshness(receipt)` detects a changed report or source as stale and missing files as unresolved.

A report's JSON `status: "pass"` **is not cryptographic CI attestation**. Only a trusted host that restricts who can create/modify reports and independently verifies CI/job provenance may use this adapter for an authoritative profile. Local demonstration tests include a real Node unit test, a separate spec report, and the green-unit/failed-spec veto. No claims are made that CRAP, mutation, pstack or genuine semantic review engines were run.

## Host / CI integration

CI runs actual test/analysis tools and publishes reports from a restricted trusted channel. An integration Adapter verifies original-run source identity, code revision, report provenance and tool-specific policy (such as CRAP complexity×coverage, mutation score/surviving mutants, Standards/Spec findings, or Interrogate disagreements) **before** returning `verified: true`. It may map tool-specific outputs to PASS, FAIL or UNKNOWN. Provenance checking, thresholds, auth, report retention, original raw artifact access and external runners stay outside Daedal Core.

No additional TDD/check runner, agent orchestrator, GitHub PR authority or OS sandbox is introduced.

## Evidence and regression boundaries

- Every verified quality report must be linked to its original code revision and issued Work Contract, and carry tool/version and report digest.
- Required missing/failed/forged/stale report cannot complete Goal.
- Advisory findings cannot silently become binding nor be erased from proof.
- Quality profile revision stales the Work Contract/proof; freshness failure changes effective completion without deleting historical receipts.
- The independent verifier is still required after quality PASS, and may reject functional or system boundary drift.
- This is additive: existing VS1–VS5 Work Contracts **without** a quality policy keep their previous local behavior, but are not retroactively described as quality-reviewed.

Deployment with authenticated tool provenance, independent real Code/Spec review and native Paperclip/Browser Harness E2E remain separate Production Acceptance Gates.
