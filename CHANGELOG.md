# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-02-25

### 🏗️ Architecture: 6-Role Responsibility Segregation
- **引入 Task Dispatcher**：新增 `task-dispatcher` Skill，定位為「一次性教導者 (mode: instructor)」。產出可重複使用的 Worker Prompt，使用者反覆餵給 Worker 即可推進全部任務。
- **Factory Orchestrator 升級**：重構為 6-Role 管線總指揮，新增 Mode-Aware Relay（CREATE / CONTINUE / MAINTAIN 三模式跳轉路由表）。
- **Factory Iterator 收束**：移除所有調度與 CI/CD 部署邏輯，聚焦於任務拆解與規格產出。新增 CI/CD 技術棧適配責任。
- **AGENT_PROTOCOL 重寫**：Worker 從「被動接收任務包」轉為「Dispatcher 教導的自服務執行者」。新增 CI 失敗恢復流程（關 PR → 遞增 attempts → 重試）。

### 🔧 CI/CD
- **Phase Bump 獨立化**：從 `auto-merge.yml` 抽出 Phase 推進邏輯，新建 `phase-bump.yml`（觸發條件：`push to main`）。修復了 Phase Bump commit 與 Squash Merge 競爭 tracker.json 的致命時序 bug。
- **Task Status Guard**：新增 CI 步驟，從 PR 分支名稱萃取 task_id，驗證 tracker.json 中該任務的 status 是否為 `completed`。
- **CI 失敗恢復**：Worker 現在能偵測 PR OPEN + CI 失敗的狀態，自動關閉失敗 PR 並重試。
- **`attempts` 計數器啟用**：Worker 在 CI 失敗恢復流程中主動遞增 `attempts`，≥ 5 次則熔斷並呼救人類。

### 📚 Documentation
- **Quarto Portal 所有權**：Orchestrator 正式成為 `index.qmd`、`docs/*.qmd`、`_quarto.yml` 的唯一擁有者 (Sole Owner)。Worker 不得直接修改文檔。
- **README 全面重寫**：對標 6-Role 架構、Dispatcher 教導者模式、CI 自動化流程。
- **FACTORY_WORKFLOW.qmd 更新**：新增 Dispatcher 教導者 Callout、初次部署說明、CI 失敗恢復 Mermaid 圖表。
- **worker-protocol.qmd 更新**：對標 Dispatcher 教導的自服務模式。

### 🔮 Deferred (Future Features)
- **已存在專案支援 (Continue / Maintain Modes)**：支援開發期與維護期專案。將優先於分散式 Worker 處理，重點在於完善既有邏輯與 Tracker 的無縫轉換。
- **分散式 Worker 調度**：已抽象至 Task Dispatcher 的 `mode: live` 升級路徑。所有調度邏輯集中在 Dispatcher，未來擴充不影響其他 Skill。

## [0.1.0] - 2026-02-22
- Initiated project boilerplate and AI Agent protocols.
