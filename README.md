# Daedal

**讓 Ikaros 在 Labyrinth 中飛行的協議規範。**

---

## 什麼是 Daedal？

Daedal 是一套協議規範，定義了如何讓 AI Agent（Ikaros）在結構化的專案環境（Labyrinth）中，可靠、可預測、可驗證地將專案迭代完成。

它不是流程工具，不是 AI 助手，不是代碼生成器。

**它是法律。** Knossos 是執法者。Ikaros 是在法律框架內行動的個體。

---

## 生態系

```
Daedal      定義規範          本 repo：Protocol、Schema、CI workflows
Labyrinth   承載結構          每個專案內的 tracker.json + specs + CI
Knossos     塔台（執法者）    驗證 Labyrinth、持續監控、觸發 Ikaros、可介入
Ikaros      飛行者            任何符合協議的 AI Agent（Jules、Devin、Cursor...）
CI          物理法則          無情仲裁，任何人都無法繞過
```

**Knossos 是必要核心，不是可選組件。**
Labyrinth 必須通過 Knossos 驗證，Ikaros 才能起飛。

---

## 核心承諾

> 只要你的 Labyrinth 符合 Daedal 規範，並通過 Knossos 驗證，
> 你就可以放心讓 Ikaros 飛，直到專案完工。

**你不需要監控每一個 PR。**
**你不需要手動推進 Phase。**
**你不需要知道 Ikaros 在做什麼。**

CI 是裁判。沒有通過 CI 的 Merge，就沒有進度推進。

---

## 為什麼需要 Daedal？

AI Agent 能寫程式。但在長期專案中，它們會：

- 破壞依賴順序
- 產生不可回溯的修改
- 繞過測試直接合併
- 在大型專案中失去結構感

Daedal 解決的不是生成能力，而是**生成治理**。

---

## Repo 結構

```
Daedal/
├── protocol/                    # Ikaros 飛行協議
│   ├── IKAROS_PROTOCOL.md       # Ikaros 每次甦醒執行的完整步驟
│   └── rules/                   # 預設規則（可複製到 Labyrinth）
│       ├── git-workflow.md
│       └── coding-style.md
│
└── labyrinth/                   # Labyrinth 規格定義
    ├── schema/                  # Knossos 用來驗證的 Schema
    │   ├── tracker.schema.json  # tracker.json 的完整 JSON Schema
    │   └── spec.schema.yml      # 任務規格書的格式規範
    ├── templates/               # 空白模板，照著填就對
    │   ├── tracker.json
    │   └── task_spec.yml
    └── workflows/               # CI 仲裁層模板
        ├── auto-merge.yml       # PR 驗證 + 自動合併
        ├── phase-bump.yml       # Phase 自動推進
        └── cleanup-stale-tasks.yml  # 每小時仲裁（Arbitrator）
```

---

## 如何使用

### 1. 制定你的 Labyrinth

複製 `labyrinth/templates/tracker.json`，填入你的專案資訊、Phase 結構與任務 DAG。

每個任務對應一份 `specs/tasks/{id}.yml`，格式參考 `labyrinth/templates/task_spec.yml`。

**Labyrinth 可以用任何方式產生：** 手工撰寫、LLM 對話輔助、Knossos UI 引導——Daedal 不在乎來源，只在乎格式。

### 2. 通過 Knossos 驗證

將你的 Labyrinth 接入 Knossos，Knossos 會驗證：

- `tracker.json` 符合 `tracker.schema.json`
- 每個 `spec_ref` 指向的檔案實際存在且格式正確
- CI workflows 的佔位符全部填入
- GitHub repo 的必要設定（PAT_TOKEN、auto-merge label）已就緒

**全部通過後，Ikaros 才能起飛。**

### 3. 放飛 Ikaros

Knossos 觸發 Ikaros（手動或 Cron 排程），Ikaros 遵循 `IKAROS_PROTOCOL.md` 自主執行：

- 讀取 Labyrinth 狀態
- 領取任務、切 branch、實作、提 PR
- CI 自動驗收、合併、推進 Phase

循環直到 Labyrinth 全部完工。

### 4. 人類的角色

- **介入**：透過 Knossos 觀測狀態、暫停排程、手動 Accept PR、強制 Retry
- **熔斷**：當某個任務 `attempts >= 5`，Ikaros 自動停止並等待人類介入
- **無需監控**：正常狀態下，你只需要等待 Knossos 通知「完工」

---

## 物理法則（不可繞過）

1. **Merge 才是進度** — 沒有通過 CI 的 PR 不能合併，狀態不推進
2. **Ikaros 不越界** — 所有變更必須在 `allowed_paths` 範圍內
3. **Arbitrator 是唯一寫入者** — `attempts` 只由 `cleanup-stale-tasks.yml` 修改
4. **Knossos 是守門人** — 未通過驗證的 Labyrinth，Ikaros 不起飛

---

## Knossos

Knossos 是 Daedal 生態系的第一個完成品，本身也用 Daedal 建造（dogfood）。

→ [Knossos repo](https://github.com/your-username/Knossos)（建造中）

---

## CHANGELOG

→ [CHANGELOG.md](CHANGELOG.md)
