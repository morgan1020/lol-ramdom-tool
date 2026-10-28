# 開源與 Windows Release 評估

評估日期：2026-10-29（台灣時間）。依使用者決定補上 MIT、第三方聲明及更新專案指引，僅更新私人儲存庫的 Release 草稿，不公開儲存庫或正式發佈。

## 結論

目前可準備 Windows x64 測試發佈草稿。已新增 `LICENSE`（MIT）與 `THIRD_PARTY_NOTICES.md`，分別說明原始程式碼、Riot 遊戲素材與第三方套件的權利，並更新 `AGENTS.md` 及 README 導覽。尚未完成 Riot 登記確認與全部公開發佈驗收，不將新增 MIT 視為公開發佈核准。

## 實際專案狀態

- 儲存庫：`morgan1020/lol-ramdom-tool`，維持 PRIVATE；已建立 v1.4.3 Release 草稿，未正式發佈。
- 版本：1.4.3；基底來源：`9d29e9e6b98f1a4142813f22a43a0e9a0ace639a`。授權、文件、套件授權中繼資料、打包設定及 UI 測試修正納入本次 main 提交；實際提交 ID 以 Release 草稿的 target commit 為準。`release-preparation-files.zip` 保留這次變更的來源檔案快照，可覆蓋至基底 commit 重現來源。
- React 19／Vite 7 網站與 Electron 45 Windows 桌面程式，共用抽籤介面。Discord 使用 Webhook，並非 Discord Bot。
- `AGENTS.md` 已改為目前 React／Vite／Electron、Discord Webhook 結構與指令，保留台灣中文、局部測試與簡短提交規範，允許單人直接在 main 開發。
- 現有 electron-builder 可建置 NSIS 安裝版及免安裝版，沒有背景自動更新。兩者皆未簽章。

## 公開前需完成

1. **確認素材權利鏈**：已採 MIT 並列明第三方例外。擁有者確認骰子圖示為 ChatGPT Image 文生圖，已記錄於聲明；舊版五路 PNG 沒有原始下載網址，明列未確認而不臆測，也不納入 MIT。後續新增素材或第三方貢獻仍需確認來源。
2. **Riot 產品登記**：官方要求服務玩家的產品登記；使用 LCU 亦須告知所用端點與用途。此專案 README 有提醒，但本次未取得已完成登記的證據。
3. **可見的非官方聲明**：已於第三方文件與 Release 保留完整聲明；App 內玩家可見的聲明呈現仍待補齊，本次未修改介面。README 或 Release 文字不能取代 App 內的可見聲明。
4. **補齊發佈驗收**：真實多人組隊、其他排隊模式、乾淨 Windows 的安裝／升級仍需驗收；簽章可作為後續改善。
5. **公開範圍檢查**：公開會曝露完整 Git 歷史與作者中繼資料，不能只檢查目前工作目錄。重新檢查遠端分支、標籤及新增歷史後再切換公開；不使用 mirror 推送或分享完整 `.git`。

## 本次檢查證據與限制

- 檢查開始時工作目錄乾淨。
- 先前針對 40 筆正常提交歷史，以常見 Discord Webhook、GitHub／OpenAI／AWS 憑證及私鑰模式掃描；僅命中 `tests/dataStore.test.js` 與 `scripts/storage-smoke.js` 的虛構 Webhook。沒有輸出任何憑證值。這不是完整安全稽核，也不保證不存在其他格式或編碼的機密。
- 歷史檔名檢查未命中 `.env`、SQLite、私鑰或憑證備份檔。
- `npm audit --json` 與 `npm audit --omit=dev --json` 均回報 0 項已知漏洞。此結果取決於當日 npm 漏洞資料庫。
- 桌面程式設定 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，限制 IPC 來源及 LCU 操作端點；僅是本次程式檢視結果，不代表已完成滲透測試。
- 打包的 ASAR 檢查：包含 React、React DOM 與 scheduler 授權；Electron 目錄含 `LICENSE.electron.txt` 及 `LICENSES.chromium.html`。未發現專案使用者資料、`.env`、Git 目錄或 smoke profile。React DOM 自帶的 test-utils 仍在依賴內。
- 局部測試：`node --test tests/appProtocol.test.js tests/desktopData.test.js tests/dataStore.test.js tests/clientTransport.test.js`，15 項通過；未執行完整測試套件。
- `npm run storage:smoke` 在沙箱外使用獨立資料目錄通過：Windows 真實加密、移轉、儲存密文、主程序傳送路徑、統計備份與重複匯入、網站隔離及重啟。Discord 外部請求為 0。
- `npm run desktop:build -- --publish never` 成功重建 Windows x64 NSIS 與 portable，未發佈至外部服務。
- `npm run ui:smoke` 原先失敗已於 2026-10-29 釐清並修正：通知檢查只選取第一則錯誤，誤讀仍保留的套用錯誤而漏掉離線通知；Discord 設定選單的測試選取器也仍指向舊容器。現在依 `data-notice-id` 和目前標題列選單檢查，並確認兩則錯誤同時存在。完整 UI smoke 重跑成功（exit 0），涵蓋桌面／網站、深淺色、1920／2560 寬畫面、手機版、偏好、錯誤保留結果、隊伍變動、Discord 設定與抽英雄。僅修改測試腳本，未更改 App 程式或安裝檔。
- Release 草稿附 `ui-smoke-result.json` 與 `ui-smoke-fix.patch`，記錄結果及可套用至原來源 commit 的測試修正；修正已納入本次 main 提交，草稿中的 patch 保留相對上述基底的差異供查閱。UI 自動化使用合成 IPC，不代表真實多人 LCU、真實 Discord 傳送或乾淨 Windows 安裝驗收。
- 本次授權與文件修改已檢查 Markdown 相對連結、AGENTS 指令、套件與 lockfile 授權一致性，並比對 React／React DOM／scheduler 的原授權全文。沒有更新依賴或修改 App 執行邏輯，不重跑完整 UI／單元測試；新增打包授權檔的檢查結果附於 `packaging-validation.json`。

## LCU 端點清單

固定讀取：

- `GET /lol-gameflow/v1/gameflow-phase`
- `GET /lol-lobby/v2/lobby`
- `GET /lol-summoner/v1/current-summoner`
- `GET /lol-summoner/v1/summoners/{summonerId}`

使用者啟用自動套用時，唯一寫入為 `PUT /lol-lobby/v2/lobby/members/localMember/position-preferences`。

## 官方依據

- [Riot Developer Policy：產品登記、素材與聲明](https://developer.riotgames.com/docs/lol#developer-api-policy)
- [Riot LCU：非官方支援介面與端點登記](https://developer.riotgames.com/docs/lol#league-client-api)
- [Riot Legal Jibber Jabber：社群專案與智慧財產規則](https://www.riotgames.com/en/legal)
- [GitHub：變更儲存庫公開狀態的影響](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)

以上是依目前程式與官方文件所做的發佈準備評估；尚未確認 Riot 審核或授權完成。
