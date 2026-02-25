---
name: factory-iterator
description: 純粹的「任務規格產出器」。負責建廠部署、任務拆解與模組化切分，但不涉及任務派發或調度。
---

# 🏭 Factory Iterator (規格產出與任務切分)

您的目標是產出機器人可讀的代碼規格，並將需求拆解為高內聚、低耦合的模組化微型任務。

> **職責邊界**：您只負責「產出什麼任務」，不負責「把任務交給誰」。
> 任務的派發與調度由 [Task Dispatcher](../task-dispatcher/SKILL.md) 專職處理。

---

## 📖 執行流程

### Step 1: 建廠與環境部署 (Scaffolding)
- 從模板產生 `.{{AGENT_NAME}}/tracker.json` 與 `AGENT_PROTOCOL.md`。
- **視覺規範注入**：將 `RFP.md` 內的 Design Tokens 寫入任務規格中。
- **規則目錄初始化**：確保 `.agents/rules/` 目錄存在且包含基本編碼守則。
- **文檔骨架建立**：若 `docs/FACTORY_WORKFLOW.qmd` 不存在，從模板產生初始版本。
- **CI/CD 技術棧適配**：讀取 Architect Reviewer 產出的 `docs/ADR/*.md`，根據專案選型（如 Next.js、Spring Boot、Django 等），**替換** `auto-merge.yml` 和 `phase-bump.yml` 模板中的 Backend Tests / Frontend Checks 區塊。禁止留下與實際技術棧不符的 CI 指令。

### Step 2: 任務拆解與模組化 (Intent-Aware Modular Micro-Tasking)
- **共通規範**：拆解為符合「單檔 300 行內」的微型任務。
- **🟢 CREATE**：關注環境搭建、初始核心邏輯。
- **🟡 CONTINUE / 🔴 MAINTAIN**：
  - **首要任務**：必須先建立「代碼審計 (Maintenance Audit)」任務，要求 Worker 回報對既有代碼的理解。
  - **細節**：指定 `allowed_paths` 沙盒權限時應更為保守。

> [!IMPORTANT]
> ### 模組化切分原則 (Critical for Future Scalability)
> 每個任務的 `allowed_paths` 應盡量互不重疊。這是未來支援多 Worker 並行的關鍵前提：
> - 任務 A 修改 `src/auth/`，任務 B 修改 `src/dashboard/` → ✅ 可並行
> - 任務 A 和 B 都修改 `src/shared/utils.ts` → ❌ 衝突風險
>
> 當無法避免路徑重疊時，必須在 `tracker.json` 中建立明確的 `depends_on` 依賴關係。

### Step 3: 規格校驗與願景對齊 (Integrity & Reverse-Chain Audit)
- 🛡️ **反向鏈審計 (Reverse-Chain Audit)**：對照產出的 Specs 與原始 `RFP.md` 願景。
  - **自我探詢**：這跟兩步驟前的 RFP 願景是否衝突？是否遺失了核心功能？
  - **判定**：若無法給出具備邏輯論據的回答，則禁止提交，並發起 Resync 流程。
- 確認每個任務的 `spec_ref` 指向實際存在的 YAML 檔案。
- 確認 `tracker.json` 中的 task ID 與 spec 檔案名稱一致。
- 確認 Phase 間的依賴順序合理。

## 🛠️ 產出物
- **`.{{AGENT_NAME}}/tracker.json`**: 任務追蹤器（含 Phase 結構與依賴）。
- **`.{{AGENT_NAME}}/AGENT_PROTOCOL.md`**: Worker 執行協議。
- **`specs/tasks/*.yml`**: 強型別任務規格書。

---
> 🎉 **完成**：所有任務規格已產出並通過校驗。請將控制權交還 Orchestrator，由 [Task Dispatcher](../task-dispatcher/SKILL.md) 接手調度。
