# Implementation status — Daedal vNext

Date: 2026-10-22. PR #1 includes VS1–VS3 and **VS4 bounded local-file demonstration**. It is not a deployed production Knossos, an OS sandbox, or the full Minimum Complete Daedal. Original Ikaros protocol, v2 tracker schema and CI templates remain unchanged.

## Verified implementation

- VS1: project-scoped recursive Goals, inherited allow/deny capability boundaries, mandatory navigation independent of optional RAG.
- VS2: compare-and-swap revisions, retained old versions, host-injected decision gate, scoped dependency/composition pins; Work Contract remains advisory.
- VS3: host-only Evidence Provider and independent reviewer interfaces, internally minted Work Contract comparison, scoped proof, parent-specific completion and affected-only needs-reverification.
- VS4: `createProtectedLocalWriter` performs **actual, exclusive, scope-checked file creation** inside a configured local workspace, checking currently issued Work Contract, host route and effective capability. The Enforced label applies only to this write method. Real local Evidence Provider reads/hashes the artifact and actually executes the selected Node test with shell disabled. Source-bound reviewer checks the actual code digest before and after an independently supplied review callback.
- TDD regressions exercise denied traversal, overwrite, stale contract, symlink, failed test, nested Node test context false-green, source change during review, and a whole local Labyrinth life cycle with a green test / code-review FAIL fixture.
- Latest GitHub Actions Run `39785504478` on `eae6659c5c06dfcdd84e587e97e35f5a925637a6`: job `contract-tests` finished `success`; raw log reports **39 tests, 39 passed, 0 failed**. Later docs-only commits require final SHA readback.

## Explicit limits / unfinished

- The bounded file adapter does **not** mediate direct OS writes, other file tools, arbitrary process execution or the whole Queqiao/Browser Harness. Parent-path races and hostile concurrent processes need OS-enforced isolation; the test runner must only run host-authorized code.
- The independent review routine in tests is synthetic and host-supplied. No authenticated live independent reviewer, general semantic Code/Spec review model, external audit attestation, persistent receipts, transport authorization, or deployable protected MCP tool is present. A `verified` flag is meaningful only if its real provider validates the original source.
- Source/test/review port identities are configured by the trusted host; the module is not an authentication boundary. Work Contract IDs are correlation identifiers, not bearer credentials.
- VS5 remains: durable storage, cross-project versioned read-only references, full deployed identity/isolation, complete real multi-session E2E and an explicit legacy migration decision. No merge or release has occurred.

See [VS3 verification contract](VERIFICATION_CONTRACT.md) and [VS4 bounded protected seam](PROTECTED_LOCAL_SEAM.md). Keep no credentials, user-specific information, unsanitized logs or private source in repository fixtures.
