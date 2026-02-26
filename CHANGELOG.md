# Changelog

## [Unreleased]

### Breaking Change: 架構重組（Protocol-First）

本版本是對 Daedal 的根本性重組。

**核心決策：** 移除所有 Skills（Orchestrator、Iterator、Dispatcher 等），
將 Daedal 還原為純粹的協議規範（Protocol Specification）。

實際驗證發現：讓 LLM 扮演多個角色跑完整流程，
在真實使用中極易被對話帶偏，流程無法穩定完成。

Daedal 不應該是「讓 LLM 跑流程的工具」，而應該是「定義 Labyrinth 規格，讓 Ikaros 確實執行」的協議。

**新增：**
- `protocol/IKAROS_PROTOCOL.md` — Ikaros 飛行協議（從 AGENT_PROTOCOL 重寫，移除所有 Skills 引用）
- `labyrinth/schema/tracker.schema.json` — tracker.json 的完整 JSON Schema（新增，解決靜默失敗問題）
- `labyrinth/schema/spec.schema.yml` — 任務規格書的格式規範（新增）
- `labyrinth/templates/` — 乾淨的空白模板
- `labyrinth/workflows/` — 重寫的 CI 仲裁層模板（加強初始化說明與註解）
- `protocol/rules/` — 預設規則（git-workflow、coding-style）

**移除：**
- `skills/` 目錄（全部移除）
- `docs/` 目錄（全部移除）
- `extensions/` 目錄
- `.agents/` 目錄
- Quarto 相關檔案（`index.qmd`、`_quarto.yml`、`publish.yml`）
- `WHITEPAPER.md`

**架構變更：**
- Knossos 從 optional 升級為必要核心（塔台角色）
- Knossos 負責驗證 Labyrinth 是否符合 Daedal 規範，通過後 Ikaros 才能起飛
- tracker.json 新增 `agent_name` 與 `base_branch` 欄位（原為佔位符，現為必填）

## [0.2.0] - 2026-02-25

- 引入 Task Dispatcher、6-Role 管線、Knossos 命名體系
- 修復 phase-bump.yml 空 Phase bug
- 新增 ADVISORY_TEMPLATE、GOVERNANCE.md

## [0.1.0] - 2026-02-22

- 初始化專案骨架與 AI Agent 協議
