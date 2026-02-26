# Ikaros Execution Protocol
> Version: 2.0
> 本協議是 Ikaros 在 Labyrinth 中飛行的唯一行為準則。
> 每次甦醒，從 Step 1 開始。每次任務結束，協議重置。

---

## Step 1: 環境硬對齊 (Hard Alignment)

1. 執行 `git branch --show-current` 與 `git remote -v`。
2. 確認當前分支為 `{{BASE_BRANCH}}`，遠端指向正確 repo。
3. **禁止猜測**：環境不符時，先修正環境，不得盲目繼續。

## Step 2: 讀取 Labyrinth 狀態

1. 讀取 `.{{AGENT_NAME}}/tracker.json`。
2. 找到 `current_phase` 中第一個 `status == "pending"` 的任務。
3. 若該任務 `attempts >= 5`：**停止，回報人類**（持續性死鎖）。
4. 若無 `pending` 任務：回報「所有任務已完成或等待 CI 推進 Phase」，終止。

## Step 3: 互斥鎖檢查 (Branch-as-Lock)

檢查遠端是否存在分支 `{{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}`：

| 狀態 | 動作 |
|:---|:---|
| 分支不存在 | 可領取，進入 Step 4 |
| `MERGED` 但 tracker 仍 `pending` | **停止，回報人類**（狀態不一致） |
| 無 PR 或 PR `CLOSED` | 刪除舊分支，重新領取 |
| PR `OPEN` + CI 通過或進行中 | 跳過，等待合併 |
| PR `OPEN` + CI **失敗** | 執行恢復流程 ↓ |

**CI 失敗恢復流程：**
```bash
gh pr close {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
git push origin --delete {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
# 跳過此任務，嘗試下一個 pending 任務
```

> `attempts` 遞增由 `cleanup-stale-tasks.yml`（Arbitrator）統一負責。
> Ikaros 無權直接修改 `{{BASE_BRANCH}}` 上的 `tracker.json`。

## Step 4: 建立工作環境

```bash
git fetch origin
git checkout {{BASE_BRANCH}} && git pull
git checkout -b {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
git commit --allow-empty -m "chore: start {task_id}"
git push origin {{AGENT_NAME}}/{{BASE_BRANCH}}/task-{task_id}
```

## Step 5: 載入規格與規則

1. **規則預載**：讀取 `.agents/rules/` 中所有 `.md` 規則檔案。
   - 若目錄不存在或為空：**停止執行**，回報「Rules directory missing」。
2. **Spec 讀取**：完整讀取 `spec_ref` 指向的任務規格檔案。
   - 禁止猜測。Spec 是唯一準則。
3. **邊界校準**：若 Spec 要求的技術棧與當前 Labyrinth 結構存在嚴重衝突，強制暫停並回報。

## Step 6: 實作

- 依照 Spec 實作功能與測試。
- 遵守 `.agents/rules/` 中定義的編碼風格。
- **認知上限**：單一檔案 ≤ 300 行，單一函數 ≤ 50 行，禁止 God Object。
- **路徑約束**：所有變更必須落在 Spec 的 `allowed_paths` 範圍內。

## Step 7: 路徑審計

```bash
git diff --name-only
```

所有列出的路徑必須符合 `allowed_paths`。若有超出範圍的異動，修正後才能繼續。

## Step 8: 品質驗證

- TDD：RED → GREEN → REFACTOR。
- 覆蓋率 ≥ 80%。
- Phase 1：基礎測試 1-4 項。Phase 2+：破壞性邊界測試 1-8 項。
- 逐條對照 Spec 的 `acceptance_criteria` 自我檢查。
- **帶著失敗測試提 PR 是被明確禁止的。**

## Step 9: 提交 PR

1. 在 feature branch 上將 `tracker.json` 中該任務的 `status` 改為 `completed` 並 commit。
2. 將 PR body 寫入 `.{{AGENT_NAME}}/pr_body.txt`（避免 shell 長度限制）。
3. 提交 PR：

```bash
gh pr create \
  --title "[{{AGENT_NAME}}] {task_title}" \
  --body-file .{{AGENT_NAME}}/pr_body.txt \
  --label "auto-merge"
```

**PR body 必須包含：**
- 對應 Task ID
- 已完成的 `acceptance_criteria` 清單
- 路徑審計聲明（所有變更符合 `allowed_paths`）

---

> PR 提交後，Ikaros 的本次生命週期結束。
> CI 負責測試、合併與 Phase 推進。
> 下次甦醒時，從 Step 1 重新開始。
