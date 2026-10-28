# Repository Guidelines

使用台灣中文。

## 專案結構與模組規劃
本專案為 React + Vite 網站與 Electron Windows 桌面 App，共用抽籤介面及規則。Discord 以 Webhook 同步，不包含 Discord Bot。

- `README.md`：對外專案首頁，介紹用途、主要功能、線上使用與 App 下載狀態。
- `docs/guide.md`：完整操作、開發、桌面打包、資料更新與部署說明。
- `src/App.jsx`、`src/components/`：共用介面及互動流程。
- `src/domain/`：抽籤、統計、名單、英雄資料與通知等核心規則。
- `src/desktop/`：Electron 主程序、preload、LCU 連線及本機加密資料儲存。
- `src/storage/`、`src/hooks/`：網站／桌面儲存介面與 Discord 同步。
- `src/data/`：英雄與分路資料快照。
- `src/*.css`：網站與桌面共用樣式。
- `public/`、`assets/roles/`：骰子圖示與遊戲分路素材。
- `scripts/`：資料更新及 Electron 冒煙驗證。
- `tests/`：Node 內建 test 測試。
- `docs/`：開源與發佈評估等補充文件。
- `LICENSE`、`THIRD_PARTY_NOTICES.md`：MIT 授權及第三方素材／套件權利聲明。
- `dist/`：網站建置產物；`release/`：Windows 產物與驗證證據，皆不提交到 Git。
- `.git/`：版本控制資料。

請保持根目錄簡潔，功能優先放在 `src/` 與 `tests/`。

## 建置、測試與開發指令
以 `package.json` 的 scripts 與 `README.md` 為準。Node.js 版本須符合 Vite 的執行需求（目前 Vite 7 需 Node 20.19+ 或 22.12+ 等支援版本）；僅滿足專案宣告的 `>=20` 不一定足夠。

- `npm ci`：依 lockfile 安裝；調整依賴時使用 `npm install` 並同步 lockfile。
- `npm run dev`：啟動網站開發伺服器。
- `npm run build`、`npm run preview`：建置／預覽網站。
- `npm run desktop`：建置介面並啟動 Electron。
- `npm run desktop:pack`：產生 `release/win-unpacked/`。
- `npm run desktop:build -- --publish never`：建置 Windows x64 安裝版及免安裝版，不自動上傳。
- `npm run desktop:installer`：僅建置 Windows 安裝版。
- `npm run update:data`：依序更新英雄及分路資料；單項更新見 `docs/guide.md`。
- `npm test`：執行測試（`node --test`）。
- `npm run ui:smoke`：使用隔離資料與合成 IPC 驗證共用介面。
- `npm run storage:smoke`：使用隔離資料驗證系統加密、移轉與備份，不傳送真實 Discord 訊息。
- `npm run desktop:smoke`：使用獨立資料目錄讀取真實 LoL 大廳並抽籤，不傳送 Discord；加上 `-- --apply-roles` 才會執行實機分路寫入及還原，需明確授權。

## 程式風格與命名慣例
- JavaScript 一律 2 空白縮排，`camelCase` 命名。
- 介面文案與使用者回覆預設台灣繁體中文。
- 核心規則優先放 `src/domain/`，避免耦合 React、Electron 或外部 API。
- 位置與統計規則變更時，必須同步更新測試。
- README 維持精簡的產品介紹與導覽；完整使用／開發細節放 `docs/guide.md`，補充評估放 `docs/`，素材與套件權利維護於 `THIRD_PARTY_NOTICES.md`。不要新增已淘汰的 Discord Bot 文件或指令。
- 不將玩家資料、Webhook、LCU 憑證、`.env`、AppData 或測試 profile 納入 Git 或發佈附件。
- MIT 僅適用本專案可授權的內容；Riot／CommunityDragon 素材與第三方套件保留原條款。更新依賴或素材時同步來源與聲明。

## 測試指引
- 預設只針對本次改動及直接受影響的流程進行測試，不因小幅修改或準備提交 / PR 就執行完整測試。
- 優先執行對應的測試檔案或案例；例如 `node --test tests/<相關測試檔>.js`，必要時搭配 `--test-name-pattern` 篩選案例。
- 純文字、樣式或版面調整，以相關畫面與互動的局部檢查為主；純文件修改只需檢查內容與差異，不必執行程式測試。
- 只有共用邏輯、跨模組變更或局部驗證顯示影響範圍擴大時，才擴大到相關測試群組；完整 `npm test` 或完整 smoke 測試僅在確有必要或使用者明確要求時執行，並說明原因。
- 修改 Discord Webhook 時，優先使用虛構網址與替代 transport；真實傳送需使用者明確授權。僅驗證受影響的儲存、切換目的地、傳送或重送流程。
- 修改 LCU／名單流程時，確認 1～5 人限制、完整 Riot ID、隊伍變動重新確認與失敗保留結果；合成 IPC 通過不等於真實多人客戶端驗收。
- UI 通知可能同時存在；測試以 `data-notice-id` 等穩定識別比對對應通知，不假設第一則通知就是本次結果。
- 語法檢查只針對修改過的適用檔案，例如 `node --check scripts/ui-smoke.js`；JSX 以相關建置驗證。
- 回報實際執行的驗證範圍與結果，不將局部測試通過描述為完整測試通過。

## Commit 與 Pull Request 規範
延續現有提交風格：簡短、祈使句、動詞開頭（例如：`Revamp UI and interactions`、`Sort stats by draw count`）。

單人開發可直接在 `main` 工作，不強制為每次修改建立分支或 PR。推送、發佈 Release 或將儲存庫設為公開，須依使用者當次授權；Release 草稿不等於公開發佈授權。不要使用 mirror 推送，也不要將完整 `.git` 作為發佈附件。

PR 請包含：
- 變更內容與目的。
- 若有使用流程、LCU 或 Discord Webhook 行為變更，描述影響。
- 本次改動相關的測試紀錄，區分自動化、合成資料與真實客戶端驗收。
- 對應 issue / 任務連結（如有）。
