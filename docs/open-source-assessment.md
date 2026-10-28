# 發布前檢查紀錄

檢查日期：2026-10-29（台灣時間）。使用者已決定在 Riot Pending Review 期間公開原始碼並發布 Windows App；產品登記及網站驗證已完成，但尚未獲核准。保留以下檢查證據與驗收限制，不將發布視為 Riot 核准。

## 範圍與結果

- 遠端只有 main，檢查時基底為 `dbcedc7f3d90763f36799f8319a2ec029a2492ef`，無既有遠端標籤。
- 先前掃描 41 筆提交、290 個 blob；最終公開前再次覆核正常分支／標籤／遠端追蹤歷史的 42 筆提交與 115 個目前檔案。常見私鑰、GitHub／OpenAI／AWS 金鑰與 Discord Webhook 模式掃描，只命中兩處合成測試 Webhook，未命中真實憑證。模式掃描不能保證不存在其他格式的機密。
- 歷史 `.env.example` 為範例，作者信箱為 GitHub noreply。未將本機 Codex 快照 refs、完整 `.git`、AppData、測試 profile 或 release 偵錯檔上傳。之後僅驗證檔 `public/riot.txt` 以提交 `b6ef909` 推送至 main，未推送版本標籤。
- MIT 與第三方聲明已補齊；Riot／CommunityDragon 資料及圖示不納入 MIT。骰子圖示由擁有者確認為 ChatGPT Image 文生圖，GitHub／Discord 圖示來源與 CC0 已記錄。舊五路 PNG 來源下載網址未記錄，明列此限制。
- 完整 `npm test`：99／99 通過。因使用者要求發布前完整檢查，本次執行完整套件。
- `npm audit --json`（包含開發依賴）：0 項已知漏洞。
- 完整 `npm run ui:smoke`：通過，使用合成 IPC，涵蓋桌面、網站、手機、寬畫面、偏好、錯誤保留結果、Discord 設定與抽英雄。
- `npm run storage:smoke`：通過，使用獨立資料與真實 Windows 加密；驗證移轉、重啟、統計匯入／匯出及 IPC 來源，Discord 外部請求為 0。
- `npm run desktop:build -- --publish never`：Windows x64 安裝版與免安裝版建置成功。授權文件隨產物提供，沒有簽章，也沒有背景自動更新。
- 程式檢視重點：renderer 沙箱與隔離、IPC 來源、固定本機 LCU 端點、資料寫入、Webhook 限制與禁止提及；不代表已進行獨立滲透測試。
- 網站／App 設定中提供完整非官方聲明；網站導引與 README 改為固定版本 v1.4.3 的實際 GitHub 安裝檔連結。

## Riot 登記

使用者已改用 Firefox 成功建立 Production 產品申請 **LOL Random Tool，App ID `898873`**，並完成網站所有權驗證（Portal 顯示 `Verification code found and validated!`）。精簡英文產品說明亦已完整儲存（`Application updated successfully!`），目前狀態為 **Pending Review（等待審核）**。依據為使用者提供的畫面與可存取性文字；本次未代為操作 Portal。

**尚未獲 Riot 核准，也尚未取得 LCU 端點用途的許可確認。** 先前內建瀏覽器的提交失敗僅為歷史事件，不再代表目前登記狀態。詳見 [完整登記紀錄與已保存的英文說明](riot-registration.md)。使用者後續已決定公開原始碼與發布 App，仍明確揭露 Pending Review。LCU 說明包括以下端點與用途：

- `GET /lol-gameflow/v1/gameflow-phase`：確認組隊大廳狀態。
- `GET /lol-lobby/v2/lobby`：讀取真人隊伍與核對隊伍是否變動。
- `GET /lol-summoner/v1/current-summoner`：核對自己的帳號。
- `GET /lol-summoner/v1/summoners/{summonerId}`：解析完整 Riot ID。
- `PUT /lol-lobby/v2/lobby/members/localMember/position-preferences`：僅使用者明確啟用時，設定自己的分路偏好；不操作隊友、不自動排隊／選角，寫入後讀回驗證。

## 尚未涵蓋

真實多人 LCU 大廳、所有排隊模式、乾淨 Windows 安裝／升級尚未完整驗收。客戶端更新可能影響 LCU 相容性。網站與 App 的設定各自保存，不代表雲端同步。

## 官方依據

- [Riot Developer Policy](https://developer.riotgames.com/docs/lol#developer-api-policy)
- [Riot League Client API](https://developer.riotgames.com/docs/lol#league-client-api)
- [Riot 素材政策](https://www.riotgames.com/en/legal)
- [GitHub 儲存庫公開狀態](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
