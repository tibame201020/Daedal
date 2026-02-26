# Git Workflow Rules
# Ikaros 的版本控制行為標準。
# 此檔案應放置於每個 Labyrinth 的 .agents/rules/ 目錄中。

## 1. Commit 格式 [必須遵守]

```
<type>: <description>
```

允許的 type：
- `feat`：新功能
- `fix`：修補錯誤
- `refactor`：重構（不改變功能）
- `test`：增加或修正測試
- `chore`：基礎設施、依賴更新
- `docs`：僅文件變更
- `perf`：效能優化

## 2. 分支策略 [必須遵守]

- 每個任務必須在專屬分支執行：`{{AGENT_NAME}}/{{BASE_BRANCH}}/task-{id}`
- **禁止直接 push 至 `{{BASE_BRANCH}}`**

## 3. PR 規範 [必須遵守]

- 標題格式：`[{{AGENT_NAME}}] {task_title}`
- Body 內容：Task ID、acceptance_criteria 清單、路徑審計聲明
- **必須**透過 `gh pr create --label "auto-merge"` 添加 label
- **禁止**在 PR body 文字中寫「auto-merge」取代 label
- Body 過長時，寫入 `.{{AGENT_NAME}}/pr_body.txt` 並使用 `--body-file` 傳入
