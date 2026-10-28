# Native Quality Runner Acceptance — 2026-10-27

## Purpose and scope

This is an additive **external-tool producer** for the existing Daedal Risk-Adaptive Quality Evidence Contract, not a second CI platform or Goal-state authority. It consumes *actual* native tool reports and leaves Daedal's independent Spec/Boundary/Goal verdict intact.

### Executed tools and local measured baseline

- **crapkit 0.8.1 + Lizard 1.24.3 + c8 10.1.3**: the tracked `src/` and `test-support/` sources, actual Node test coverage remapped to Istanbul JSON. At source commit `0cc1991c73b85870228f74ed346a2c3bac57d161`, scanned **191 functions**, **179 measured**, **12 untested** and **43 over the default complexity/CRAP target 6**. Overall grade **F**, CRAP load **966.89**. This is a brownfield baseline, not a PASS.
- **StrykerJS 10.1.1**: actual mutations in `src/quality-review.mjs` with its real Node tests; **265 mutants, 189 killed, 76 survived**, mutation score **71.32%**. This is intentionally only *one* changed-code pilot; it is not the project-wide mutation score.
- **GitHub PR review**: actual [PR #1](https://github.com/tibame201020/Daedal/pull/1) has no independent submitted approval on the checked revision. Therefore PR approval evidence remains **UNKNOWN**.
- **pstack Interrogate**: reviewed the upstream methodology; no independently attested multi-model review result has been executed in this pilot. Evidence remains **UNKNOWN**, not auto-PASS.

Tool commands are recorded in `.github/workflows/quality-native-tools.yml`; its inputs are pinned tool versions, original native output files and repo HEAD. Tests for the native report parser and source/origin guard run in the regular Daedal Node CI. No tool output, raw mutated code, credentials or user-specific local paths are checked into the repository.

### Adapter boundary

`src/quality-native.mjs` reads the actual crapkit and Stryker schema (including independent statuses; not a self-asserted `passed: true` field). The host-chosen limits produce PASS/FAIL/UNKNOWN from real metrics. `summarizeGitHubReviews` requires a different reviewer and approved state pinned to the exact commit. `summarizeInterrogate` requires at least two distinct reviewer receipts tied to the same commit; a missing or unverified reviewer produces UNKNOWN.

`createNativeQualityReportProvider({ retrieve, verifyOrigin, limits })` can feed these native results into the existing `qualityEvidenceProvider.resolve` port. **An authenticated host must implement `verifyOrigin` independently**, including the original run identity, exact source commit, report checksum and artifact access authorization. The adapter does not elevate any arbitrary JSON to trusted evidence. Merely running a script inside Actions does not establish reviewer identity or issue a signed attestation.

### Pilot policy versus mandatory checks

`docs/vnext/QUALITY_TOOL_POLICY.example.json` deliberately marks the new CRAP and mutation findings **advisory** until a measured baseline and review threshold are accepted: the example would classify 43 over-target functions and the 71.32% mutation score as FAIL against its strict example limits, yet the advisory CI job reports these transparently rather than hiding them or blocking all historical debt.

Invalid/missing native reports, failed tools or mismatched source revisions **fail the measurement job**. Tool-specific risk thresholds only fail the job if explicitly set to `required` by the host policy. The permanent Unit/Contract/Source-size/Coverage gates remain mandatory. This prevents the first introduction of a new metric from destabilizing the entire project.

### Production acceptance still separate

Native PR review verification via trusted GitHub API, authoritative artifact attestations, pstack model-execution identity (including independent reviewer context), OS isolation, full mutation scope and external Paperclip/Browser Harness E2E remain not accepted. A true quality receipt must be verified by the host and remain subject to Daedal's independent Goal/Code/Spec check. The pilot never self-approves or merges the PR.

## Confirmed GitHub Actions pilot — 2026-10-27

Branch source commit `6ff0d0fed27e40d81c303a1d57e95e862fdb3607`: both jobs passed. Mandatory Contract Tests run `40441052507` yielded **86/86 PASS, 0 fail, 0 skip**, with Line 99.63%, Branch 89.57%, Function 97.97%. Separate Native Quality Tools run `40441052567`, job `121981227653`, completed SUCCESS, including **crapkit doctor + coverage**, **StrykerJS mutation**, and the final report/source-SHA validator.

The GitHub PR checkout for native tooling used generated **merge commit** `051d57931903ab5e09cf0d7a7986989d07a37d72` (not the branch HEAD), and the validator bound reports to that actual checked-out revision: **207 functions, 195 measured, 48 over CRAP target (grade F, load 1114.5)**, and **265 Stryker mutants, 189 killed / 76 survived, mutation 71.32%**. Both exceed/fall below the deliberately strict advisory example thresholds and were reported as **FAIL**; only *execution and metric/provenance consistency* passed the pilot job. The baseline figures at the top of this document are from an earlier branch HEAD, not the PR merge checkout.

Initial Linux workflow failures were fixed without disabling validation: crapkit `doctor` required explicit exclusions for quality runner scripts/config; then Stryker's sandbox hit a Python venv `lib64` symlink. The Python venv was moved outside the repository into `RUNNER_TEMP`, leaving both tools independently runnable. Local npm install printed dependency vulnerability/deprecation warnings (including two moderate audit findings), which require dependency review before any production-grade required policy.

**This job is advisory**. It has not generated a cryptographically signed GitHub Actions attestation or supplied independent pstack model reviews. Raw reports stay ephemeral and are not committed. A future host that uses reports for Goal completion must independently verify the CI run identity, checked-out commit, artifact digest, caller/reviewer identity and policy.
