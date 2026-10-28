# VS4 — Protected Local File Seam (bounded demonstration)

This is a real *local operation* adapter, not an OS sandbox, a global file-permission manager, a deployed MCP server, or a production authenticated Knossos host. The original Daedal / Labyrinth / Knossos / Ikaros roles remain unchanged.

## Three narrow host-owned ports

- `createProtectedLocalWriter({ labyrinth, workspaceRoot, routes })` exposes only `writeNewFile`. It validates a Labyrinth-issued, unmodified, current Work Contract and its effective capability against host-owned `{ prefix, capability }` routes; rejects traversal, wrong/missing directories, disallowed capability, symlinks in observed paths, overwrite and stale/unresolved contracts. Creates a real file with exclusive create (`wx`) and returns a SHA-256 readback. Its `describe().enforcement === 'enforced'` applies **only to this method invocation**.
- `createLocalEvidenceProvider({ workspaceRoot, artifactPath, testPath, projectId, goalId, implementerId })` reads a host-selected local code artifact, calculates its actual SHA-256, executes a host-selected Node test file with no shell and a timeout, checks exit status and source stability, and supplies real source metadata to VS3. `NODE_TEST_CONTEXT` is removed from nested test execution to prevent false green results when already running inside `node --test`.
- `createSourceBoundVerifier({ workspaceRoot, artifactPath, reviewerId, reviewSource })` rereads the actual artifact and checks its digest before/after the host-provided independent review function. It passes source text, the accepted Goal context and pinned subject to that review function, then binds the result to the source digest. **The host is responsible for authenticating the review identity and ensuring `reviewSource` genuinely inspects code and functional/system boundaries.** A boolean or synthetic keyword rule is not general semantic verification.

## Trust and deployment conditions

The host controls the workspace, route/capability configuration, Labyrinth instance, source/test paths, implementer identity and reviewer port. An Agent may request an operation or provide a source reference, but may not replace these protected dependencies. The Work Contract itself continues to say `advisory`: possession of its `contractId` does not grant arbitrary tool or filesystem authority. Only the protected adapter method can report its own covered operation as `enforced`.

This is a single-process, best-effort local seam. Direct OS writes, separately connected tools, alternate handles, symlink-directory races, hostile concurrent processes, untrusted code executed by the Node test runner, reviewer credentials, durable receipts and host access isolation are **not** mediated or guaranteed. Production deployment must restrict direct write access to the workspace (for example an isolated worker with an exclusive writable mount and only the protected tool exposed), authenticate caller/reviewer at the transport layer, and decide on an OS-level race-resistant filesystem policy.

## Evidence / acceptance

`test/protected-local.test.mjs` covers actual writes, denial paths, nested test runner false-pass regression, source mutation and green-test / semantic-fail separation. `test/local-lifecycle.test.mjs` exercises the **real** `createLabyrinth` with scoped file creation, real Node test execution, live source readback and independent-review port: valid source completes its child Goal, while a synthetic source code drift marker fails review despite a passing unit test. The marker is an acceptance fixture, not a general-purpose code-review engine.

Retain VS5 for persistent revisions/proofs, real cross-project Live References, transport identity and production deployment/whole-product E2E. Do not migrate the legacy tracker/protocol/workflows based on this slice alone.
