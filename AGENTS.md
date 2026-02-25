# Repository Guidelines

## 專案結構與模組規劃
本專案目前包含兩個部分：舊版單頁網頁工具 + Discord 機器人。

- `英雄聯盟抽籤.html`：原始單頁版抽籤工具（HTML/CSS/JS 單檔）。
- `src/`：Discord Bot 主程式。
- `src/commands/`：Slash Command 路由與指令邏輯。
- `src/domain/`：核心規則（抽籤、統計、名單合併）。
- `src/repositories/`、`src/db/`：SQLite 資料存取。
- `scripts/register-commands.js`：註冊 guild 指令。
- `tests/`：Node 內建 test 測試。
- `.git/`：版本控制資料。

請保持根目錄簡潔，功能優先放在 `src/` 與 `tests/`。

## 建置、測試與開發指令
主要開發目標為 Discord Bot；網頁檔仍可直接開啟。

- `open 英雄聯盟抽籤.html`  
  在 macOS 開啟舊版網頁工具。
- `npm install`：安裝 Discord Bot 依賴。
- `npm run register`：註冊/更新 guild slash commands。
- `npm run start`：啟動 bot。
- `npm test`：執行測試（`node --test`）。

## 程式風格與命名慣例
- JavaScript 一律 2 空白縮排，`camelCase` 命名。
- 指令文案與使用者回覆預設繁體中文。
- 核心規則優先放 `src/domain/`，避免耦合 Discord API。
- 位置與統計規則變更時，必須同步更新測試。

## 測試指引
發 PR 前至少完成：

- `npm test` 必須通過。
- 手動測試 `add/remove/list/draw/stats/from-voice`。
- `from-voice` 需確認：發令者在語音頻道、bot 不會被加入、上限 5 人生效。
- 語法檢查可用：`node --check src/index.js`（或檢查全部 `.js`）。

## Commit 與 Pull Request 規範
延續現有提交風格：簡短、祈使句、動詞開頭（例如：`Revamp UI and interactions`、`Sort stats by draw count`）。

PR 請包含：
- 變更內容與目的。
- 若改動指令，附上新增/變更的 slash command 清單。
- 主要流程手動測試紀錄（含 `from-voice` 情境）。
- 對應 issue / 任務連結（如有）。
