# Implementation status — Daedal vNext

Date: 2026-10-23 (Asia/Taipei). **VS1–VS5 are implemented as a bounded, test-backed local product slice**, not a deployed production Knossos or an approved legacy migration. This is a clarification of original Daedal concepts, not a replacement Agent/Issue framework.

## Verified capabilities

- **VS1** — Project-scoped recursive Goals; child inherits ancestor scope; required context is independent of optional RAG.
- **VS2** — Revision CAS/history; dependency- and composition-aware Work Contracts; localized invalidation and explicit unknown state.
- **VS3** — Registered contract snapshots; host-injected evidence and independent review ports; source/revision-pinned proof, separate child and parent Goal completion; no Agent-supplied self-PASS.
- **VS4** — A real protected local `writeNewFile` operation, actual file/test provenance, source-bound review port, denial of stale/out-of-scope/traversal/overwrite paths; Enforced applies **only to that operation**. Test reviewer uses a disclosed synthetic source rule.
- **VS5** — Trusted local state snapshot/export/restore, file lock + CAS + temporary write/fsync/rename, checksum-corruption rejection, retained contract/proof/revision history; separate Project's read-only versioned Goal projection via a host resolver; a CAS-governed Live Reference refresh with re-check after decision callback.
- With a supplied freshness port, the local Evidence Provider rehashes the source **and** test-file bytes; changes produce `needs-reverification`, missing origins produce `unresolved`. Parent completion also depends on current child proof.
- A complete fixture crosses store reconstruction, real protected file creation, actual Node test execution, externally provided source review, child + parent acceptance, source Project change, local reference refresh, re-verification and external test-file mutation.
- Synthetic regression cases also reject Paperclip ownership duplication and Browser Harness core modification despite green unit tests; this is **not** a general semantic code-review engine.

## Domain Contract & Code Review remediation

- `decompose`, `relate` and `reviseGoal` enforce explicit Actor / expected revision / Decision Risk with recorded revisions; relevant callbacks recheck freshness before committing. Parent composition and content have distinct CAS fields.
- Discovery candidates do not modify effective relations. Acceptance requires a trusted independent provenance check, then a separately auditable accepted revision. Restored snapshots validate Candidate and Accepted Knowledge integrity; experimental snapshot schema is now v2.
- The public `labyrinth.mjs` entrypoint delegates to small original-domain components. Source-size regression checks enforce <=300 lines per `src/*.mjs` and <=50 lines per declared top-level function; a read-only snapshot query view replaces mutable `read()`.
- `npm test` enforces >=80% aggregate line/branch/function coverage in CI. See [Domain Contract closeout](DOMAIN_CONTRACT_CLOSEOUT_20261023.md) and the initial independent [acceptance review](ACCEPTANCE_REVIEW_20261023.md).

## Fresh remote verification

Code-and-docs commit `38ca9f3a929ebfcd0b63b8f8f2dc598ed269317a`: GitHub Actions `Daedal vNext Contract Tests` run **39841010543**, job **120041698314**, completed / success; raw job output: **66 tests / 66 pass / 0 fail / 0 skip**, line **99.73%**, branch **89.96%**, function **97.46%** overall. Subsequent documentation-only commits require their own HEAD/CI readback.

## Remaining production acceptance gates

- Authenticated caller, approver, Evidence Provider and *separate reviewer* identity; actual independent Agent 3 or comparably independent human/host review, including real Goal+Code/Spec semantic assessment.
- Actual deployment mediation: OS-level writable workspace isolation, malicious path-race resistance, bounded tool exposure. The present writer cannot intercept direct OS writes or other Queqiao/Browser tools.
- Live external-service authorization, transport audit receipts, tenant isolation, durable external backup/restore drill and distributed concurrency. Snapshot checksum is not a signature against a hostile owner of the storage directory.
- Complete acceptance using actual native Paperclip / Browser Harness (not synthetic names or fixtures), plus scoped reviewer evidence and the agreed migration decision.
- No merged PR, no release, no v2 `tracker.json` migration and no claim of production readiness.

See [VS3 verification](VERIFICATION_CONTRACT.md), [VS4 protected operation](PROTECTED_LOCAL_SEAM.md) and [VS5 durability/references](DURABILITY_AND_REFERENCES.md). Do not put credentials, personal information, private source snapshots, unredacted logs or host state files in the repository.

## Risk-Adaptive Quality Evidence (2026-10-27)

A trusted-host optional, additive policy/evidence seam now selects a versioned Review Profile from existing Door × Blast Radius × Evidence Confidence. Required checks yield PASS/BLOCK/UNKNOWN and are pinned to actual source/Goal/Contract/Profile versions. Reports are normalized through a host port; the local file-backed adapter reads actual JSON bytes/source digests and can detect stale or missing reports after completion. Missing policy on restore fails closed for quality-pinned Contracts. Independent Code/Spec review remains mandatory; no actual pstack, CRAP or mutation engine is automatically executed. See [Quality Contract](RISK_ADAPTIVE_QUALITY_EVIDENCE.md). This is **not** authentication, a signed CI attestation or production QC.

### Quality Evidence CI verification — 2026-10-27

At source commit `072a8540e14efc02e63e532c615b55a9d839c22c`, GitHub Actions `Daedal vNext Contract Tests` run `40439559294`, job `121976345092` completed SUCCESS: **81 tests / 81 pass / 0 fail / 0 skip**. Aggregate coverage: Line **99.69%**, Branch **89.99%**, Function **97.86%**. Includes real local JSON report/source re-hashing and actual Node test execution. These are **adapter/contract tests**, not live CRAP, mutation, pstack or production identity attestation.

### Native CRAP/Mutation/Review producer pilot — 2026-10-27

Real `crapkit 0.8.1` + `c8 10.1.3` measured per-function CRAP risk; real `StrykerJS 10.1.1` executed mutants in `src/quality-review.mjs`. Raw native JSON ingestion, exact source commit checks and independently host-verified report-origin port are added under `src/quality-native.mjs`; see [native tool runner pilot](NATIVE_QUALITY_RUNNERS_20261027.md). The new advisory CI job runs these pinned external tools. Initial recorded source baseline: CRAP **191 functions / 43 over target**, Mutation **71.32% (189 killed, 76 survived)**. These are not CI PASS signals and no authenticated GitHub PR or independent pstack review has been accepted (UNKNOWN).

#### Native runner CI evidence

Branch commit `6ff0d0fed27e40d81c303a1d57e95e862fdb3607`: GitHub Actions `Daedal vNext Contract Tests` run `40441052507` **86/86 PASS**; `Daedal Native Quality Tools (advisory baseline)` run `40441052567` SUCCESS (crapkit / Stryker / source validator). Its PR merge checkout `051d57931903ab5e09cf0d7a7986989d07a37d72` measured 207 functions, 48 above CRAP target, and 265 mutations with 71.32% score. These measurement **FAIL** results remain advisory, not converted to PASS. Independent PR/pstack review not accepted.

### 2026-10-27 Product drift audit remediation

A code/Spec audit of PR #1 identified three P1 gaps (descendant Live Reference invalidation, mandatory ancestor acceptance/decisions in Navigation, evidence freshness after reviewer callback) and a P2 PR review chronology bug. Targeted RED tests were observed before corrections. See [drift remediation](DRIFT_REMEDIATION_20261027.md). These corrections do not establish independent multi-agent review or solve the artifact SHA-256 versus Git commit SHA native evidence mapping.

### 2026-10-28 — CI Provenance pilot

A TDD-verified bridge binds a local tracked source artifact SHA-256 to the tested Git Commit and original Git blob; PR Merge SHA is deliberately distinguished from PR Head. The Native Quality workflow uploads the original reports + exact-source Evidence Bundle and requests GitHub OIDC/Sigstore attestation and CLI verification **on trusted push runs only**. New source binding tests cover modified/untracked/unsafe source, wrong commit, forge attempts and stale reports. See [provenance contract](QUALITY_PROVENANCE_20261028.md). The host still needs a fully verified attestation/source mapping implementation for autonomous Goal acceptance; do not promote a signed bundle directly to PASS.

#### Signed native quality evidence — verified CI, 2026-10-28

At implementation HEAD `a217ed960501f3be8b5c11e9fe3a15513c2c02c9`, Contract Tests run `40633666546` PASS (97/97) and Native Quality run `40633666518` SUCCESS, including signed Sigstore GitHub artifact attestation and `gh attestation verify` on the exact manifest bytes. Artifact ID `12791804292`; manifest SHA-256 `eb1d0086cf1ba4d2a26a5f878f95cd69d78db6d309d124881e7aefd90bfb5b43`. Quality scores remain advisory FAIL. This authenticates CI manifest origin, not independent semantic correctness or native product acceptance. Details in [Quality Provenance](QUALITY_PROVENANCE_20261028.md).
