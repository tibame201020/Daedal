# VS5 — Durable Labyrinth and Live Project References

Status: implemented as a **bounded local trusted-host demonstration**, not an authenticated, isolated production Knossos deployment.

## Keep Daedal simple

Daedal remains the protocol; Labyrinth is the recursive Project Goal map; Knossos is its navigation and verification host; Ikaros is any conforming working Agent. This stage adds two host-side adapters to the existing Goal/Contract/Evidence seam. It does not create a global cross-project owner, replace native Issues, or dispatch Agents.

## Host-owned durable snapshots

`createLabyrinth(seed, { initialSnapshot, ...trustedPorts })` restores the same Project map, revision history, issued Contract snapshots, accepted proof receipts and external-reference pins. `exportSnapshot()` is a **trusted-host-only** data surface, not an Agent-facing import/export permission. Restore rejects wrong Project/root, duplicate/cyclic/missing parent Goals, widened child boundaries, malformed relationships, mismatched contract/proof associations and unsupported schema versions. A snapshot stores **proof provenance metadata**, not the entire source or test log.

`createFileSnapshotStore({ directory })` supplies `transact(seed, ports, fn, { expectedRevision })` and `read(seed, ports, fn)`: synchronous state reconstruction, Project-level version CAS, a host-directory writer lock and exclusive temporary write followed by fsync / atomic rename. A thrown callback or rejected revision does not publish an updated map. Checksum detects accidental corruption, **not a malicious user who can rewrite both data and checksum**. Directory/file ownership, identity, backup/rollback, lock recovery and shared-filesystem semantics belong to the deployment host. No untrusted Agent may select the directory, ports, snapshot or operation closure. The host must not put personal records, credentials or raw private code into the repository or public receipts. External file writes performed by an operation are not rolled back if a state transaction later fails; production orchestration must design idempotent effects.

## Independent source projects

`createProjectResolver({ getProject })` exposes only a source Project's `inspectReference(goalId)` projection. The source projection includes accepted Goal outcome, acceptance, effective ancestor boundary and a SHA-256 version projection that changes when relevant source/ancestor versions change. It has **no source write operation**.

A consuming Project attaches a `live-reference` with expected local Goal version and actor, recording its own revision and source pin. Contract checks compare the live source on each revalidation: changed source => `stale`; unavailable/invalid source => `unresolved`; unaffected sibling Contracts remain current. A changed reference requires an explicit `refreshReference` revision transaction, matching source and local expected revisions, risk decision and a post-review freshness recheck. It cannot silently adopt the source update or acquire source capabilities. Dependency and completion checks remain Project-scoped.

## Evidence freshness

Where the host supplies `evidenceProvider.freshness(receipt)`, existing completion is rechecked against its actual evidence. The local provider rehashes both the source artifact **and the selected test file** on Goal status read; a mismatch => `needs-reverification`, missing/unreadable source => `unresolved`. Parent completion is recomputed from its own proof **and current child completion**, not merely from a stored PASS. When no freshness port is supplied, status only means revision-scoped historical proof, not a claim of continuous external source monitoring.

## Regression and scope limits

`test/durable.test.mjs` covers state recovery, corruption, CAS, retained proofs, versioned external references and refresh race conditions. `test/durable-lifecycle.test.mjs` exercises actual local file creation, a real nested Node test, independent host-supplied **synthetic** source rule, child and parent proof, process-like store reconstruction, source Project revision reconciliation, re-verification and external test-file modification. It is **not** a deployed native Paperclip or Browser Harness acceptance test and does not prove a general model-based Code/Spec verifier.

Not delivered: authenticated human approvals, independent Agent 3 deployment, MCP transport isolation, OS-enforced workspace ownership, hostile concurrent filesystem protection, remote durable database / distributed transactions, backup restore drills and real external-project tenant authorization. Therefore keep the PR Draft rather than claiming full production release.

## Legacy migration gate (proposal, not performed)

The original v2 `tracker.json`, Ikaros Protocol and CI templates remain untouched. A later migration should first import old Phase/Task/spec references **as discovery candidates**, reconcile Product Goals and boundaries, pin original sources, and independently re-evaluate historical `completed` status. A tracker flag or merged PR is not automatically an accepted Goal proof. Run a shadow comparison before changing existing automation or deprecating the legacy protocol; require explicit, verified migration acceptance.

## Experimental snapshot schema

Snapshot schema v2 stores discovery candidates and accepted knowledge alongside versioned goals and proofs. Earlier experimental vNext schema-1 snapshots fail closed; original v2 tracker remains untouched. No automatic migration or completed-status promotion.
