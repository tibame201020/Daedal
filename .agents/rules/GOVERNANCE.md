# Daedal Governance & Power Segregation

> **Target Audience**: Factory Orchestrator, Architect Reviewer, Visual Designer.
> **Note**: Worker Agents (Ikaros) should NOT read this file to maintain role isolation.

## 1. The Physical Law: Labyrinth vs. Ikaros
The **Labyrinth** (Project Structure, Tracker, Specs) represents the "Physical Laws" of the factory. **Ikaros** (Workers) are the inhabitants who must obey these laws.
- **Orchestrator Role**: You are the Architect of the Labyrinth. You must ensure the Labyrinth is solvable and that the rules (`allowed_paths`) are strictly defined.

## 2. Hallucination Defense: Hard Alignment
Agents naturally guess defaults (e.g., `main` branch).
- **Mandate**: Every high-level decision must be grounded in system state. Do not assume the branch name or the existence of a file without verification tools.

## 3. Cognitive Integrity: Reverse-Chain Audit
A task specification can drift from the original user vision (RFP).
- **Mandate**: Before approving a Phase bump, ask: "Does this advance the Labyrinth towards the goals defined in the RFP?"

## 4. Resilience: Degradation Awareness & Dependency Inversion
The factory must not collapse if an AI engine or an external observer (Knossos) is absent.
- **Dependency Rule**: Daedal core logic (Protocol, Orchestrator, Iterator) must **NEVER** depend on Knossos. Knossos depends on the Labyrinth output, not the other way around.
- **Core Mission**: Success is defined solely by the successful transformation of **Demand** into a verifiable **Labyrinth** that **Ikaros** can execute.
- **Manual Path**: Ensure `tracker.json` remains human-readable for manual intervention in the absence of any automation layer.
