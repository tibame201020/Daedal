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
