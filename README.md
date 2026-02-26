# Daedal

### The Structured AI Software Factory

在 AI Coding Agent 爆發的時代，
問題已經不是「能不能寫程式」，
而是——**能不能可控地推進專案**。

Daedal 是一套結構化 AI 軟體工廠框架，
將生成式 AI 納入可驗證、可治理的工程流程。

它不是更強的 Agent。
它是讓 Agent 不失控的系統。

---

## 為什麼需要 Daedal？

AI Agent 可以：

* 產生大量程式碼
* 快速重構模組
* 連續自動迭代

但它們常常：

* 破壞依賴順序
* 產生不可回溯的修改
* 合併錯誤代碼
* 在大型專案中失去結構

Daedal 解決的不是「生成能力」，
而是「生成治理」。

- **治理勝於生成 (Governance over Generation)**: 核心理念是建立嚴格的結構約束，讓 AI 在既定軌道上運行。
- **文學化治理 (Literate Governance)**: 修改 `labyrinth.yml` 藍圖，Daedal 即成為你的自動化執行引擎。
- **物理性驗收 (Physical Arbitration)**: 透過 CI/CD 扮演「物理法則」，強制執行規格審計與合併守則。

---

# Daedal 生態系統

Daedal 並不是單一工具。
它是一個角色分離的體系。

---

## 🧠 Daedal — 框架本身

定義整套工廠的規則與協議。

* 任務必須是 DAG
* 狀態必須透過 Git 推進
* 合併必須經 CI 驗證
* Worker 不得越權

Daedal 是幾何學。
它定義邊界。

---

## 🏗 Labyrinth — 被建造的專案結構

每個使用 Daedal 初始化的專案，
都會生成一個「Labyrinth」。

它包含：

* `labyrinth.yml`（文學化藍圖 - Source of Truth）
* `.labyrinth/tasks/*.json`（原子化執行狀態）
* `tracker.json`（唯讀進度視圖）
* CI workflows（自動仲裁物理法則）

Labyrinth 是專案的骨架。
Worker 只能沿著結構行走。

---

## 🏛 Knossos — 調度中心（Dashboard）

Knossos 是人類俯瞰迷宮的地方。

它提供：

* 任務進度可視化
* PR 與 CI 狀態
* 手動或排程 Trigger
* 日誌與執行紀錄

Knossos 不寫程式。
它觀測與觸發。

---

## 🕊 Ikaros — Worker Agents

Ikaros 是所有外部 AI Agent 的統稱。

可以是：

* Jules
* Devin
* Cursor Agent
* 任何符合協議的執行者

Ikaros 可以生成。
但它無法決定專案是否前進。

---

## ⚖ 仲裁層（CI/CD）

這是整個系統的物理法則。

* 測試失敗 → 無法合併
* 驗收未通過 → 狀態不推進
* PR 不乾淨 → 退回修正

在 Daedal 中：

> 沒有 Merge，就沒有完成。

---

# 核心價值

Daedal 建立三件事：

### 1️⃣ 可預測性

任務順序由 DAG 決定，而不是 Agent 猜測。

### 2️⃣ 可驗證性

每次推進都必須通過 CI。

### 3️⃣ 權力分離

設計、執行、觀測、仲裁彼此分離。

這使得 AI 不再是失控的加速器，
而是可治理的生產力。

---

# 我們的立場

AI 不需要更多自由。

它需要更好的結構。

Daedal 不是取代工程師。
它讓工程流程在 AI 時代仍然成立。

---

# 適用場景

* 自動化專案迭代
* 長期無人值守開發
* 多 Agent 協作
* 需要強 CI 控制的專案
* 企業級 AI 開發流程實驗

---

# 🚀 快速上手 (Quick Start)

### 1. 準備工廠地基
```bash
git clone https://github.com/tibame201020/Daedal.git my-new-app
cd my-new-app
```

### 2. 喚醒總指揮 (Orchestrator)
打開你偏好的 AI 工具（Claude Code、Cursor、Jules 等），輸入：

> 👉 「請讀取 `skills/factory-orchestrator/SKILL.md`，你是 Factory Orchestrator 總指揮官，我們準備開工。」

Orchestrator 會依序引導你走過 5 個階段：
- **Requirements Analyst** — 需求探測與意圖分類
- **Visual Designer (可選)** — Design Tokens 與 Wireframe
- **Architect Reviewer** — 技術選型與 ADR 產出
- **Factory Iterator** — 任務拆解、CI/CD 適配、建廠部署
- **Task Dispatcher** — 產出可重複使用的 Worker Prompt

### 3. 放牛吃草 (Unleash the Worker)
Dispatcher 會給你一段 Worker Prompt。 把這段 Prompt 反覆餵給你的 Worker Agent（例如 Jules），Worker 會自動：
- 讀取 `.labyrinth/tasks/` 尋找任務 (由 `labyrinth.yml` 藍圖驅動)
- 切 branch、實作、測試、提 PR
- CI 自動 merge + 自動推進 Phase
- 直到專案完工為止。

*觸發方式由你決定：Web GUI、API、Cron、n8n 隨便你。*

---

# 當前狀態

Early-stage framework.
正在持續演進與驗證。

---

# 簡單一句話

> Daedal 是一套將生成式 AI 納入確定性工程流程的控制框架。

不是飛得更高。
而是飛得更穩。