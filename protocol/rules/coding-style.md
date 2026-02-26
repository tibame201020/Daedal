# Coding Style Rules
# Ikaros 的編碼行為標準。
# 此檔案應放置於每個 Labyrinth 的 .agents/rules/ 目錄中。

## 1. 不可變性 [必須遵守]

- 禁止原地修改傳入的參數或外部狀態
- 使用 map、filter、spread 等方式產生新物件
- 理由：減少副作用，確保狀態可回溯

## 2. 錯誤處理 [必須遵守]

- 禁止空的 catch 區塊（靜默失敗）
- 函數開頭進行參數校驗，不符合則立即拋出異常
- 錯誤訊息必須指出出錯模組與可能原因

## 3. 輸入驗證 [必須遵守]

- 所有外部輸入（API、DB、檔案、使用者）進入業務邏輯前必須驗證
- 優先使用強型別 Schema 驗證（如 Zod、Pydantic、Bean Validation）

## 4. 檔案與函數結構 [必須遵守]

- 單一檔案 ≤ 300 行
- 單一函數 ≤ 50 行
- 巢狀深度 ≤ 4 層
- **禁止 God Object 與 Big Ball of Mud**

## 5. 註釋規範

- 解釋「為什麼」而非「是什麼」
- 代碼本身應具備自釋性（Self-documenting）
