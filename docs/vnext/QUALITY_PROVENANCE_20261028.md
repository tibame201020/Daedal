# CI Evidence Provenance and Source Identity — 2026-10-28

## Purpose

Close the **local artifact SHA-256 ↔ Git Commit SHA** identity mismatch without moving Goal verification into CI or changing Daedal's recursive Goal model.

The existing `createLocalEvidenceProvider` pins a Goal proof to the SHA-256 of an actual source file. The native crapkit/Stryker producer pins its reports to the checked-out Git Commit. For GitHub PRs, the tested commit is often GitHub's generated **PR Merge Commit**, not the PR Branch HEAD.

## Source binding contract

`createVerifiedGitSourceBinding({workspaceRoot,relativePath,expectedCommit})` requires a real regular, tracked file in the exact checked-out Git worktree:

- Require actual `git rev-parse HEAD` to match `expectedCommit`. No accepted alias between PR Head and PR Merge SHA.
- Reject traversal, untracked file, symlink, file absent from the tree and changed working-tree source.
- Read the real current file and original `git show HEAD:<path>` bytes, verify exact equality, record content SHA-256 and Git blob SHA-1 and the tested commit.
- Never derive a Git Commit from a source digest alone. A source digest is not an identity certificate; the Git tree contents establish the correspondence.
- `createNativeQualityReportProvider` permits a local source SHA-256 to differ from the report's Git Commit SHA **only** if the trusted host's `verifyOrigin` returns the verified source mapping (same source digest, tracked blob/relative path, tested commit) and verifies the original report checksum. If the host cannot verify the mapping, the quality check remains UNKNOWN.

A host/provider returning `trusted:true` is **not itself** cryptographic proof. In deployment, host identity and attestation verification are necessary.

## Native Evidence Bundle

`scripts/quality/build-evidence-bundle.mjs` generates `reports/quality/native-evidence.json` from original source bytes, Git tree, original crapkit and Stryker reports, and host-supplied policy thresholds. It records:

- `testedCommit` (the actual checked-out Commit SHA);
- separately `pullRequestHeadSha` for a PR, validated against the merge commit second parent;
- tracked source path, source SHA-256 and Git blob SHA;
- original native report file paths, bytes and SHA-256;
- calculated CRAP/Mutation metrics, preserving advisory FAIL rather than inventing PASS.

The builder rejects stale CRAP commit, invalid/incomplete report, changed source bytes, misidentified PR HEAD, or mismatch between actual checkout and expected source SHA.

## GitHub Actions provenance

The pre-existing `Daedal Native Quality Tools` job now generates and uploads the original reports + Evidence Bundle with a seven-day artifact retention period. On repository-owned `push` or same-repository `pull_request` events, it requests a GitHub Sigstore OIDC attestation using `actions/attest@v4` and then performs `gh attestation verify`, restricted to the exact repository, signing workflow, source commit, source ref and hosted runner. External fork PRs remain unsigned; same-repo PR attestations prove workflow provenance, not independent approval.

A signed manifest attests **which GitHub Actions workflow signed the manifest bytes**, not whether an agent's original Goal intent is correct, whether the raw reports are good, or whether an untrusted workflow can author malicious report data. The independent host must still verify signer identity, bundle subject digest, GitHub run/source context, source mapping and report contents before supplying an authoritative `verifyOrigin` response. Consult GitHub's warning about workflow-controlled predicate metadata.

The default CRAP and Mutation quality thresholds remain **advisory**, and PR/pstack independent reviewer execution remains UNKNOWN. Signing a measurement bundle never grants Daedal Goal completion authority.

## Reproducible regression checks

`test/quality-source-binding.test.mjs` creates isolated real Git repositories, validates source/commit mapping, rejects traversal/untracked/modified source, exercises a PR merge revision distinct from Branch HEAD, validates the native provider's trusted mapping requirement and rejects a stale/forged native report bundle. Production source/test implementation and external legacy protocol/tracker remain unchanged.

This slice is a signed CI provenance pilot, not fully authenticated multi-agent Production Acceptance or native Paperclip/Browser Harness E2E. No user credentials or private files enter Git.

## Fresh acceptance from GitHub Actions (2026-10-28)

PR #1 source HEAD `a217ed960501f3be8b5c11e9fe3a15513c2c02c9` (documentation follow-up commits may have different HEAD):

- Contract suite run **40633666546**, job **122635593605**, **97/97 PASS**, 0 fail/skip, Line **98.98%**, Branch **89.35%**, Function **97.99%**.
- Native Quality run **40633666518**, job **122635593666**, SUCCESS. Evidence Bundle producer validated the tested PR **merge commit `49049e3239c045a9db227d303bd593a59a996241`**, and source `src/quality-review.mjs` SHA-256 `4c48e74f17d930eb9ca0aebb1f6a862900e3e16e86fbe42a71a9317c2937f264`.
- Artifact **12791804292** (`daedal-native-evidence`), retention until 2026-11-04 UTC; archive SHA-256 `e085bcf38060d5caa17649169f22ce26ad799e6cb3f1e8a47362d3ad669f9717`.
- `actions/attest@v4` **SUCCESS**; signed manifest subject digest: `sha256:eb1d0086cf1ba4d2a26a5f878f95cd69d78db6d309d124881e7aefd90bfb5b43`. The job log confirms a GitHub OIDC Sigstore Public Good certificate, Rekor transparency-log submission and repository upload. `gh attestation verify` **SUCCESS**, with signing Workflow and hosted-runner restrictions.
- Actual crapkit measurement: **217 functions / 205 measured / 49 over target**, grade F. Stryker **265 total / 189 killed / 76 survived, 71.32%**. These remain **advisory FAIL** against the example policy; signing an artifact does not turn them into passing quality measures.

This establishes real signed **artifact provenance for the CI manifest**. Production still lacks a host-side attestation-verifying `verifyOrigin` service, authenticated independent reviewer and native Paperclip/Browser Harness E2E. Those requirements remain separate, and PR #1 remains Draft.
