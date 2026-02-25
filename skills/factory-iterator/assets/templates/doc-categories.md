# 📚 專案知識庫索引 (Knowledge Base Index)

本文件是專案知識庫的進入點。Worker Agent 在實作前應閱讀此處列出的對應類別。

## 🏛️ 核心架構 (Core Architecture)
- [架構決策紀錄 (ADR)](docs/ADR/README.md) - 記錄所有重大技術決定。
- [系統規格書](docs/system_spec.md) - 整體系統功能定義。

## 💾 資料模型與持久化
- [資料庫 Schema 規範](docs/db_schema.md) - 定義表格、關聯與索引。

## 🔌 API 與外部整合
- [API 介面定義](docs/api_spec.md) - 定義端點、輸入輸出格式。

## 🛠️ 開發與運維
- [環境自愈手冊](docs/ENVIRONMENT_FIX.md) - 常見錯誤修復指引。

---
> 💡 **給 Worker Agent 的提示**：若您建立了新的核心功能且邏輯複雜，請務必在 `docs/` 下建立對應的 Markdown 說明文件，並將其鏈接至本索引中。
