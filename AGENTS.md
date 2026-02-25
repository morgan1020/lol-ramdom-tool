# Repository Guidelines

## 專案結構與模組規劃
本專案目前是輕量的單頁網頁應用。

- `英雄聯盟抽籤.html`：包含完整功能（HTML 結構、CSS 樣式、JavaScript 邏輯）。
- `.git/`：版本控制資料。

若後續新增檔案，請保持根目錄簡潔，依用途分資料夾（例如：`assets/`、`styles/`、`scripts/`），方便從單檔逐步拆分。

## 建置、測試與開發指令
本專案不需要建置流程，可直接執行。

- `open 英雄聯盟抽籤.html`  
  在 macOS 直接用預設瀏覽器開啟頁面。
- `python3 -m http.server 8000`  
  啟動本機伺服器，便於模擬正式環境（剪貼簿與部分瀏覽器行為在 HTTP 下更穩定）。
- `git status`  
  提交前快速確認變更內容。

## 程式風格與命名慣例
- HTML/CSS/JS 使用 2 空白縮排，與現有檔案一致。
- JavaScript 變數與函式使用語意明確的 `camelCase`（例如：`selectedPlayers`、`renderKnownPlayers`）。
- 共用常數使用全大寫加底線（例如：`STORAGE_STATS`）。
- UI 文案預設維持繁體中文，除非需求明確要求調整語言。
- 互動行為邏輯應靠近對應 DOM 區塊，避免事件處理分散難維護。

## 測試指引
目前沒有自動化測試；發 PR 前請至少完成以下手動驗證：

- 新增/移除玩家，確認上限為 5 人。
- 執行抽籤，確認結果表格與統計資料正確更新。
- 切換深淺色主題後重新整理，確認設定可保留。
- 驗證一鍵複製與快捷鍵（`Enter`、`c`）行為正常。

若未來拆出可重用模組或複雜邏輯，請新增測試目錄（例如：`tests/`）並補上執行方式。

## Commit 與 Pull Request 規範
延續現有提交風格：簡短、祈使句、動詞開頭（例如：`Revamp UI and interactions`、`Sort stats by draw count`）。

PR 請包含：
- 變更內容與目的。
- UI 調整的前後截圖或短影片。
- 主要流程的手動測試紀錄。
- 對應 issue / 任務連結（如有）。
