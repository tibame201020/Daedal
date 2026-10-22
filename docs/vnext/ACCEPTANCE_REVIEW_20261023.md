# Daedal vNext — Independent Acceptance Review (2026-10-23)

**Scope:** PR #1 `main...feat/vnext-recursive-goal-contract`, independent fixed-point readback against `docs/vnext/SPEC.md` and original Ikaros execution standards. This is a **review verdict**, not an Agent-written completion receipt.

**Verdict: LOCAL VS1–VS5 SLICE CONDITIONAL PASS; FULL SPEC / PRODUCTION ACCEPTANCE WITHHOLD.** Keep PR OPEN/DRAFT. No self-approval, merge, legacy migration or release.

## Proven evidence

- Initial reviewed HEAD `6941442f3c897dce7dc02e4d8a8197c07b86c545`; workflow run `39822639655`: 50/50 tests PASS.
- Independent isolated checkout at the exact HEAD on Windows: initial 49 PASS / 1 FAIL. The failure is the test fixture's inability to create a Symlink without the host privilege (`EPERM`), not a proven bypass of the actual denial logic.
- Two newly independently reproduced defects:
  1. Q17 false invalidation: adding an unrelated sibling Goal in a source Project unexpectedly moved an existing consumer Work Contract from `current` to `stale` because the reference fingerprint included ancestor `compositionVersion`. Independent RED: 2/3 PASS; fix pins ancestor goal revision but child composition of the referenced Goal. GREEN: 3/3.
  2. Rehydration accepted the same Project/Root ID with a changed bootstrap acceptance, silently using the prior snapshot. RED reproduced; fix checks the original normalized bootstrap Goal Seed in the snapshot, while retaining valid subsequent Goal revisions.
- The Symlink fixture now skips **only** on creation-permission errors (`EPERM`, `EACCES`, `ENOTSUP`), rather than reporting an unrelated platform permission issue as application logic failure. Linux CI still runs the test.
- GitHub readback at fixes HEAD `07588c8fc30f4f21d3153d9dac9d1a2cd0f91500`: Actions run **39826062461**: **55 tests / 55 pass / 0 fail / 0 skip**. Isolated Windows checkout: **55 tests / 54 pass / 0 fail / 1 explicitly skipped**.
- Independent local Node `--experimental-test-coverage --test`: **99.69% line, 87.04% branch, 96.58% function** overall. Coverage was measured locally, not yet enforced in CI.
- Full PR patch readback: no change beneath legacy `protocol/` or `labyrinth/`; no user records/credentials were inserted into the regression fixtures.

## Standards axis

1. **Must resolve for original-protocol conformity:** original `protocol/IKAROS_PROTOCOL.md` Step 6 specifies a file <=300 lines and function <=50 lines. `src/labyrinth.mjs` is **428 lines** at the locally corrected revision and `createLabyrinth` owns many unrelated behaviors. This is a documented-standard breach; refactor into smaller domain components under regression coverage rather than inventing a new framework.
2. **Review concern:** `createFileSnapshotStore.read(seed, ports, callback)` passes a mutable Labyrinth into a method named `read`. Trusted host only, but the API name/intent does not enforce immutability; clarify or enforce its contract.
3. **Measured limitation:** source/comment/test checks above meet local numerical coverage baseline but coverage is not yet a mandatory threshold in GitHub Actions.

## Spec axis / blocking gaps

1. **Revision Transaction for all effective map changes (Q14 / Spec invariant 5) is incomplete.** `decompose` and `relate` directly change the map without required Actor/Expected Goal Revision or a Decision record. Independent reproduction: `decompose({expectedVersion:999,...})` was accepted; parent `compositionVersion` advanced; `revisions().length` remained zero. This violates the auditable autonomous-change contract.
2. **Discovery -> Accepted Knowledge (Q20 / Spec invariant 4) remains incomplete.** `navigate(retrieved)` labels candidates but there is no provenance validation/acceptance transaction promoting a checked discovery into a typed effective graph fact.
3. **Independent live verification / deployment** remains synthetic or trusted-host-injected. No authenticated actor/reviewer transport, general Code+Spec semantic QC, external audit receipt attestation, protected multi-tool / OS write boundary or native Paperclip/Browser Harness acceptance. This is documented, so a local-slice pass must not be reported as Production PASS.
4. **Trust boundary:** local atomic file checksum is accidental-corruption detection, not protection against an actor controlling the storage directory; host identity, restore authorization, backup and recovery drills remain to be tested. The bounded `writeNewFile` adapter does not mediate other tools or direct OS writes.

## Accepted / withheld

| Gate | Verdict |
|---|---|
| Original concept and legacy unchanged | PASS |
| Existing + independent regression suite on Linux | PASS (55/55) |
| Bounded local VS1–VS5 life cycle | PASS under documented trusted-host assumptions |
| Scoped relation/seed consistency bugs | FIXED + REGRESSION |
| Original standards and complete Revision/Knowledge contracts | WITHHOLD |
| Authenticated hosted Knossos and actual independent semantic QC | NOT DEMONSTRATED |
| Real native Paperclip/Browser Harness E2E, host isolation and recovery | NOT DEMONSTRATED |
| Full Minimum Complete Daedal production acceptance | **WITHHOLD** |

Next: TDD for `decompose`/`relate` transaction receipts/CAS, discovery provenance/acceptance, split oversized `createLabyrinth`, enforce CI coverage, then independent genuine external E2E/security acceptance. Historical flags and synthetic review keyword tests must not be promoted to a completed product goal. Do not merge/release on the basis of this local verification alone.

## Subsequent remediation (2026-10-23)

The two local review blockers under Standards/Spec — direct decompose/relate map mutation without CAS/Decision audit and Discovery promotion without independent source verification — have been addressed in the additive work on this same Draft PR. `labyrinth.mjs` has been split by original Domain responsibility, with source-size regression checks and CI coverage thresholds. See [Domain Contract closeout](DOMAIN_CONTRACT_CLOSEOUT_20261023.md). This historical review remains the initial verdict; subsequent source, test and CI evidence supersede its listed local blockers but **does not** constitute a production-hosted acceptance.
