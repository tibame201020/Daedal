# {{AGENT_NAME}} Agent Execution Protocol
> 本協議由 **Task Dispatcher (教導者)** 編寫。你遵循的每一步，都是 Dispatcher 教你的。

> ⚠️ **雙份維護警告 (Dual Maintenance Notice)**
> 本文件的執行邏輯與 `skills/task-dispatcher/SKILL.md` 中的 Worker Prompt 模板描述相同流程。
> 若修改本文件的任何 Step，**必須同步更新** Dispatcher 的 Worker Prompt 模板，反之亦然。

## ⚠️ 角色聲明

> **您是被指導的執行者 (Instructed Executor)，不是自主決策者。**
>
> 本協議包含任務尋找、分支管理等「看似調度」的操作。
> 但這些行為**不是你自主決定的**——它們來自 Task Dispatcher 編寫的標準化流程。
> **知識的來源 (Source of Truth) 集中在 Dispatcher，你只是忠實地執行。**

---

## Step 1: 讀取狀態與尋找任務 (State Read & Task Discovery)

> **此步驟由 Dispatcher 教導，Worker 機械性執行。**

1. **讀取 `.{{AGENT_NAME}}/tracker.json`**。
2. 找到 `current_phase` 中第一個 `status == "pending"` 的任務。
3. 🛡️ **健康檢查**：若該任務的 `attempts` >= 5，視為「持續性死鎖」，**停止執行**並回報人類。
4. 若沒有 `pending` 任務，回報「所有任務已完成或正在等待 CI bump phase」並終止。

## Step 2: 互斥鎖檢查與分支建立 (Branch-as-Lock & Checkout)

> **此步驟由 Dispatcher 教導，Worker 機械性執行。**

1. 檢查遠端是否已存在分支 `{{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}`：
   - **不存在** → 可領取。
   - **已存在** → 檢查 PR 狀態（`gh pr list --head {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id} --state all --json state,statusCheckRollup`）：

| PR 狀態 | 判定 | 動作 |
|:---|:---|:---|
| `MERGED` 但 tracker 仍 `pending` | ⛔ Transaction 不一致 | **停止，回報人類** |
| 無 PR 或 `CLOSED` | 🔄 失效分支 | 刪除舊分支，重新領取 |
| `OPEN` + CI 通過或進行中 | 🔒 鎖定中 | 跳過此任務，等待合併 |
| `OPEN` + CI **失敗** | 🔁 失敗恢復 | 執行以下恢復流程 ⬇️ |

**CI 失敗恢復流程：**
```
1. 關閉失敗的 PR：gh pr close {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
2. 刪除遠端分支：git push origin --delete {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
3. 跳過此任務，嘗試下一個 pending 任務
```

> ⚠️ **attempts 遞增由 `cleanup-stale-tasks.yml` (Arbitrator) 統一負責。**
> Worker 無權直接 push 至 `{{BASE_BRANCH}}`，因此不得自行修改 tracker.json 的 attempts。
> Arbitrator 每小時掃描後自動遞增 attempts 並推送至 main，確保「單一寫入點 (Single Writer)」。

2. 領取任務後：
   ```
   git fetch origin
   git checkout {{BASE_BRANCH}} && git pull
   git checkout -b {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
   git commit --allow-empty -m "chore: start {task_id}"
   git push origin {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
   ```

## Step 3: 載入規格與上下文 (Load Spec & Context)

- **⚖️ 規則預載**：讀取 `.agents/rules/` 目錄中的所有 `.md` 規則檔案。
  - **護欄**：若目錄不存在或為空，**停止執行**並回報：「Rules directory missing. 禁止在無規則約束下執行。」
- **1:1 Spec 讀取 (No Guessing)**：
  - 完整讀取任務對應的 `spec_ref` 檔案。
  - **嚴格限令**：禁止「猜測」任務，必須依此檔案為唯一準則。
- **維護模式審計 (Maintenance/Audit Step)**：
  - 若專案已有既有程式碼，您**必須**先執行 `list_dir` 與 `grep_search` 遍歷涉及的模組。
  - **禁令**：禁止隨意修改既有的命名規範或基礎架構，除非 Spec 明文要求。
- 讀取 `docs/doc-categories.md` 索引以獲取專案背景。

## Step 4: 實作功能 (Implement)
- 依照 Spec 實作功能，嚴格遵守 Rules 文件中的程式碼風格。
- 實作必須包含：功能程式碼 + 對應的單元測試／整合測試。
- 若有架構或 Skill 邏輯變更，**應在 PR Description 中標註**建議更新 `FACTORY_WORKFLOW.qmd` 的內容，由 Orchestrator 統一維護。Worker **不得直接修改** `FACTORY_WORKFLOW.qmd`。

- 🧠 **認知上限與架構守則 (Cognitive Load & Architecture Limit)**：
  1. **檔案長度控制**：新建立或修改的檔案，長度應盡量保持在 200~300 行以內。
  2. **反模式禁令 (Anti-Patterns Ban)**：絕對禁止寫出「全能上帝物件 (God Object)」或「大泥球 (Big Ball of Mud)」。
  3. **壞了就換 (Disposable Components)**：如果舊有的小型模組充滿 Bug 難以修復，請果斷刪除並重寫。

## Step 5: 自我修復與路徑審計 (Self-Healing & Path Auditing)
- 雖然需嚴格遵守 Spec，但身為高階 Agent，**您被授權進行邏輯上的自我修復與環境適應**。
- 🛡️ **機械性約束 (Allowed Paths Check)**：
  - 在執行 `git commit` 前，您**必須**執行 `git diff --name-only`。
  - **嚴格限令**：所有異動檔案的路徑必須位於 Spec 中定義的 `allowed_paths` 範圍內。
  - 若偵測到超出範圍的異動，您必須修正代碼，或在 PR 中明確說明理由並請求人類核准。
- **授權行為**：您可自行加入必要的配置、微調架構或修正先前的錯誤，並將此「自主修正 (Self-Healing)」的紀錄寫入 `CHANGELOG.md`。
- 目標：**在不偏離核心功能的目標下，確保程式碼能 100% 成功執行與編譯。**

## Step 6: 驗證品質 (Validate & TDD)
- **TDD 三部曲**：撰寫測試 → 確認失敗 (RED) → 實作功能 → 確認通過 (GREEN)。
- **80% 覆蓋率**：確保單元測試 + 整合測試覆蓋率達到 80% 以上。
- 🛡️ **TDD 分級制 (Phase-aware Testing)**：
  - **Phase 1 (Setup)**：僅強制要求測試 1-4 項 (基礎守後)。
  - **Phase 2+ (Implementation)**：必須全面涵蓋 1-8 項破壞性邊界測試。
  1. `Null/Undefined` 行為。
  2. 空陣列 / 空字串傳入。
  3. Spec 中定義的 `negative_test_cases`。
  4. 邊界數值 (Max/Min)。
  5. 錯誤路徑 (網路請求失敗、Timeout、DB 失聯)。
  6. **併發競爭 (Race Conditions)**。
  7. 極端大資料量 (10k+ items) 效能分析。
  8. 特殊字元 (Unicode, Emoji, SQL injection 防禦)。
- 對照 Spec 的 Acceptance Criteria 與 Success Criteria 逐條自我檢查。
- 若任何一條未通過，回到 Step 4 或 Step 5 修正，**不得帶著失敗的測試提 PR**。

## Step 7: 提交 PR (Submit Pull Request)
- 在確認所有測試通過、且 `git diff` 符合路徑約束後：
  1. 在 Feature Branch 上將 `tracker.json` 中該任務的 status 改為 `completed` 並 commit。
  2. 提交 PR，目標分支為 `{{BASE_BRANCH}}`。
- **PR 格式**：
  - **Title**：`[{{AGENT_NAME}}] {task_title}`
  - **Description** 必須包含：
    - 對應 Task ID。
    - 已完成的 Acceptance Criteria 列表。
    - **路徑審計報告**：聲明所有變更均符合 `allowed_paths`。
  - **必須**添加 GitHub Label `auto-merge` 以觸發自動合併。
  - **推薦指令**：`gh pr create --title "[{{AGENT_NAME}}] {task_title}" --body "{description}" --label "auto-merge"`

---

> 🏁 **Worker 的生命週期到此結束。** PR 提交後，CI/CD 會自動執行測試、合併、並在所有任務完成時推進 Phase。你無需等待或關心結果。
> **下次被喚醒時，從 Step 1 重新開始即可。**
