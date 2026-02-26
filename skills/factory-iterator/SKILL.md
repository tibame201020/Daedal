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

### Step 1: 物理建廠與環境部署 (Labyrinth Scaffolding)
- **基礎設施部署**：從模板產生 `.{{AGENT_NAME}}/tracker.json`、`AGENT_PROTOCOL.md` 以及 GitHub Actions 模板。
- **規則目錄初始化**：確保 `.agents/rules/` 目錄存在且包含基本編碼守則。
- **文檔骨架建立**：產生初始版的 `docs/FACTORY_WORKFLOW.qmd`。
- **組立式 CI 配置**：根據 Architect Reviewer 評選的技術棧，**組合**對應的 CI 片段。
    - *原則：不再讓 Agent 去「編輯」Yaml 邏輯，而是將標準測試片段「注入」進模板位置。*

### Step 2: 邏輯規格拆解 (Labyrinth Specification)
- **任務拆解與模組化**：根據 `RFP.md` 產出高內聚、低耦合的任務清單。
- **視覺規範注入**：將 Design Tokens 寫入任務的 `spec_ref` 檔案。
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
- 🛡️ **Labyrinth Guard (一致性守衛)**：
  - 驗證 `tracker.json` 的 `current_phase` 是否存在於 `phases` 陣列中。
  - 驗證所有任務 ID 的全域唯一性。
  - 驗證 `depends_on` 的邏輯閉環（無循環依賴）。
- 確認每個任務的 `spec_ref` 指向實際存在的 YAML 檔案。
- 確認 `tracker.json` 中的 task ID 與 spec 檔案名稱一致。
- 確認 Phase 間的依賴順序合理。

## 🛠️ 產出物
- **`.{{AGENT_NAME}}/tracker.json`**: 任務追蹤器（含 Phase 結構與依賴）。
- **`.{{AGENT_NAME}}/AGENT_PROTOCOL.md`**: Worker 執行協議。
- **`specs/tasks/*.yml`**: 強型別任務規格書。

---
> 🎉 **完成**：所有任務規格已產出並通過校驗。請將控制權交還 Orchestrator，由 [Task Dispatcher](../task-dispatcher/SKILL.md) 接手調度。
