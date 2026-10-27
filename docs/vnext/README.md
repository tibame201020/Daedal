# Daedal vNext

This directory refines **the original Daedal concept**, not a replacement. Daedal is the protocol, Labyrinth the recursive project map, Knossos the independent navigator/verification host, and Ikaros any compliant Agent. Modern Skills/CI/MCP supply methods and adapters, not an alternative governance model.

Start with [decisions](DECISION_TREE.md), [spec](SPEC.md), [implementation status](IMPLEMENTATION_STATUS.md), [VS3 verification contract](VERIFICATION_CONTRACT.md) [VS4 protected local seam](PROTECTED_LOCAL_SEAM.md), [VS5 durability and live references](DURABILITY_AND_REFERENCES.md), [Risk-Adaptive Quality Evidence](RISK_ADAPTIVE_QUALITY_EVIDENCE.md), [Domain Contract closeout](DOMAIN_CONTRACT_CLOSEOUT_20261023.md), and root [domain glossary](../../GLOSSARY.md).

The in-memory domain seam is `src/labyrinth.mjs`; `src/protected-local.mjs` covers a bounded local file operation and source-grounded evidence; `src/durable.mjs` persists host-owned snapshots and resolves versioned read-only source projections. None constitutes a deployed authenticated sandbox. Run `npm test` with Node 22+. The legacy `protocol/` and `labyrinth/` paths stay intact; this slice is not a production-ready migration.
