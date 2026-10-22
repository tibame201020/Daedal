# Daedal vNext

This directory refines **the original Daedal concept**, not a replacement. Daedal is the protocol, Labyrinth the recursive project map, Knossos the independent navigator/verification host, and Ikaros any compliant Agent. Modern Skills/CI/MCP supply methods and adapters, not an alternative governance model.

Start with [decisions](DECISION_TREE.md), [spec](SPEC.md), [implementation status](IMPLEMENTATION_STATUS.md), [VS3 verification contract](VERIFICATION_CONTRACT.md) [VS4 protected local seam](PROTECTED_LOCAL_SEAM.md), and root [domain glossary](../../GLOSSARY.md).

The first in-memory, host-agnostic domain seam is `src/labyrinth.mjs`; `src/protected-local.mjs` is a bounded local file-operation adapter, not a complete execution sandbox. Run `npm test` with Node 22+. The legacy `protocol/` and `labyrinth/` paths stay intact; this slice is not a production-ready migration.
