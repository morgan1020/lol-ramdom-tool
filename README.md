# LOL 抽籤工具

React + Vite 版英雄聯盟抽籤工具，同時提供靜態網站與 Windows 桌面 App，兩者共用抽籤介面與規則。Discord 使用 Webhook 同步，不包含 Discord Bot。

採用「準備設定 → 抽籤操作」流程，集中設定玩家與參數。桌面版以頂部導覽切換工具，結果以五欄卡片呈現；手機版以單欄玩家列表呈現，底部操作區與可捲動內容分開，不遮擋玩家結果。Discord 同步設定可展開。新使用者預設明亮主題，既有深淺色偏好繼續保留。保留桌面 AppData 儲存、Webhook 加密、舊資料自動移轉與統計匯出／匯入。五路圖示直接呈現 [CommunityDragon SVG](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/) 的原始金色，隨程式打包；來源與處理方式記錄於 `assets/roles/svg/README.md`。

玩家列表與卡片不顯示頭像；歷史玩家可連續點選加入／取消。準備頁的輸入框、主位選單與按鈕使用一致高度及欄位對齊；桌面與手機皆以頂部分段按鈕切換抽分路／抽英雄。可用 `npm run dev` 預覽網站，或 `npm run desktop` 以開發模式查看桌面版。

大視窗的內容寬度會隨視窗延展，上限為 1680px；1440px 以上同步增加字級、控制項與結果卡片尺寸，避免最大化後仍維持小視窗比例。準備頁按鈕仍緊接內容，手機版保留原有列表與底部操作區。

## Windows 桌面 App

執行 `release/LOL-Random-Tool-1.4.0-Windows.exe` 即可使用，不需安裝 Node.js。這是尚未簽章的可攜式版本；首次啟動需解壓縮，可能較慢。版本更新時關閉舊版並替換執行檔即可，目前沒有自動更新。

1. 在同一台 Windows 電腦開啟並登入 LoL 客戶端，建立組隊大廳。
2. 開啟 App，預設選取「客戶端隊伍」，會讀取一次目前名單；人員變動後可在準備頁按「重新讀取」。這不是持續即時監看。
3. 在準備頁確認參加玩家、抽籤方式與 Discord 傳送位置，再按「完成設定，進入抽籤」。抽籤頁僅保留玩家卡片、「返回設定」、「複製結果」與「開始抽籤／重新抽籤」。返回設定保留原名單與參數；修改名單或分路偏好後重新抽籤。按「開始抽籤」，結果直接顯示在各玩家卡片中。客戶端來源的「開始抽籤」與「重新抽籤」每次都會重新讀取隊伍；手動來源沿用自己編輯的名單。兩種來源在準備頁切換。抽籤前若讀到不同隊伍、自己的帳號或指定主位偏好，會回到準備頁要求確認，不會直接將新名單加入抽籤、統計或 Discord。
4. 「抽籤方式」預設為全部隨機，也可選擇「保留客戶端第一偏好」或「自訂主位偏好」。自訂時在準備頁的玩家列選擇主位；已有結果時先按「返回設定」。第一偏好重複時會阻擋抽籤，請改成自訂偏好調整，或選擇全部隨機。
5. 若希望抽完直接設定 LoL 分路，在準備頁開啟「抽完更新我的 LoL 分路」（預設關閉，會保留原版設定）；只有客戶端名單顯示此設定。抽英雄不會套用；關閉開關不還原已套用的分路。

準備頁與抽籤卡片不顯示頭像；玩家名稱靠左，偏好選單與移除按鈕固定靠右。手動名單的「歷史玩家」位於「加入」左邊，選單內可連續點選加入／取消，選取後不自動收起。

玩家名單、統計、複製結果與 Discord 訊息隱藏 Riot ID 的 `#標籤`，內部識別、統計儲存鍵與客戶端操作仍保留完整 ID。同名不同標籤的玩家會顯示「名字 · 1」「名字 · 2」，不會合併帳號。深淺色切換仍在右上角，並沿用原本儲存的主題與統計資料。網站共用相同卡片版面，提供手動名單、偏好、抽英雄、統計與 Discord，同時保留小螢幕排版。

自動套用只更改自己的帳號，不更改隊友。主位對應第一偏好、副位對應第二偏好；五人抽籤沒有副位時保留當時的第二偏好，若與主位衝突或不能沿用則不寫入，提示手動調整。套用前重新確認帳號、完整隊伍、模式與大廳狀態，僅在非自訂召喚峽谷大廳嘗試套用，其他模式交由手動操作。網站不會顯示此開關。

寫入後會讀回確認，畫面顯示成功或失敗原因。套用失敗不影響抽籤結果、統計與 Discord 同步；逾時或無法確認結果時不會自動重送，請先查看客戶端。若隊伍與抽籤名單不同、帳號不符或已開始排隊，會阻擋套用。客戶端仍決定排隊時實際分配的位置，偏好不保證一定取得該位置。

僅支援組隊大廳內的 1～5 位真人玩家，排除機器人與觀戰者；超過 5 人會阻擋，不會截斷名單。尚未登入、沒有大廳、排隊、選角、遊戲中、無法取得完整 Riot ID 或讀取途中隊伍變動時，顯示錯誤並保留手動操作。多人真實大廳仍需實機驗收，自訂房間不會自動挑選其中一隊。

桌面端以 Windows 程序資訊取得 LCU 連線資料，對本機 `127.0.0.1` 發出固定 GET 查詢；啟用自動套用時，唯一的寫入端點為 `PUT /lol-lobby/v2/lobby/members/localMember/position-preferences`。不自動排隊或選角，不需要 Riot 密碼或 API key。連線憑證只留在主程序記憶體，不提供給網頁畫面、不寫入設定或紀錄；僅本機 LCU 請求允許其自簽憑證，不關閉全域 HTTPS 驗證。若客戶端以系統管理員執行，可能需要讓兩者執行權限一致。

App 的統計、主題、抽籤方式、自動套用設定與 Discord 目的地改存於 `app.getPath('userData')/data/application-data.json`（Windows 預設位於 `%APPDATA%` 的 App 專屬目錄）。實際路徑可在「設定 → 資料與備份」查看並開啟。與瀏覽器網站各自獨立，不會自動同步；App 不需要啟動 Vite 或本機 HTTP 伺服器。

Webhook 使用 Electron `safeStorage` 的非同步系統加密功能保存，完整網址只在主程序解密與傳送；畫面只取得目的地名稱、ID 與啟用狀態，編輯時網址留空可保留原網址。桌面版不再透過 renderer 的 fetch 傳送 Discord 訊息。加密不可用時不會改存明文，資料損壞或無法解密時也不會重設空白資料。換 Windows 帳號或電腦時，可能需要重新設定 Webhook。

新版第一次啟動會讀取同一桌面 App 的舊 localStorage，先加密寫入新檔並讀回驗證，再清除已移轉且內容相符的舊鍵。清除中斷時下次會繼續確認；舊資料若已變更，會保留且不覆蓋目前 AppData。移轉或儲存失敗時保留舊資料並顯示原因。寫入採同目錄暫存檔替換，並保留上一版 `application-data.json.bak`；檔案異常時可從備份復原，不會自動清空。

LCU 並非 Riot 保證相容的第三方服務，客戶端改版可能需要更新。對外發布前，依 [Riot LCU 說明](https://developer.riotgames.com/docs/lol#league-client-api)登記產品及使用端點。桌面安全設計參考 [Electron 官方指南](https://www.electronjs.org/docs/latest/tutorial/security)。

```bash
npm install
npm run desktop        # 建置共用介面並啟動桌面 App
npm run desktop:pack   # 產生 release/win-unpacked/ 資料夾
npm run desktop:build  # 產生 Windows x64 可攜式執行檔
npm run desktop:smoke  # 使用獨立資料目錄測試讀取與抽籤，截圖放在 release/smoke/
npm run ui:smoke       # 使用虛構 IPC 測試五人、同名、主題、設定及網站，截圖放在 release/ui-smoke/
npm run storage:smoke  # 隔離資料夾內驗證真實系統加密、移轉、匯入／匯出；不連線 Discord
```

冒煙測試會在可讀取的大廳執行一次本機抽籤，使用全新的設定，不傳送 Discord 訊息；客戶端未就緒時確認錯誤畫面。桌面程式放在 `src/desktop/`，`npm run build` 仍只建置靜態網站到 `dist/`，不包含 Electron 或客戶端憑證。`release/` 不提交到 Git。

`npm run desktop:smoke -- --apply-roles` 是明確啟用的實機寫入測試：暫時套用自己抽到的分路、讀回確認，完成後還原原本偏好；一般冒煙測試不寫入客戶端。如果測試期間使用者自行改動偏好、帳號、隊伍模式或開始排隊，測試不會強制覆蓋，需手動確認。已在目前單人積分大廳驗證 HTTP 201 空回應、成功讀回與還原；真實多人與其他排隊模式仍需驗收。

## 統計匯出／匯入

網站與桌面版皆可在「設定 → 資料與備份」操作：

- **匯出統計**：產生含格式版本、匯出時間與統計的 JSON 檔，保留完整玩家識別碼，不包含 Webhook、主題或其他設定。桌面版透過系統儲存視窗選擇位置，網站交由瀏覽器下載。
- **匯入統計**：先選擇 JSON 檔並查看玩家數與重複名單預覽，再確認寫入；選檔本身不會更改統計。支援此工具的版本 1 備份，以及舊版純統計 JSON。
- **合併名單**：保留其他玩家，同一完整玩家識別碼以匯入檔的次數取代，不重複加總，因此重複匯入同一檔案不會灌水。
- **取代全部統計**：確認後以匯入檔取代目前統計，不更動 Discord 與其他設定。空檔案取代會清空統計，畫面會事先顯示數量與取代提示。

檔案上限 5 MB、5000 位玩家，僅接受既有五路與非負 0.5 倍數次數。格式、版本、名稱或次數不合法時拒絕匯入，原紀錄維持不變。不同 Riot 標籤與舊手動名稱不自動合併。可透過統計備份搬移網站與桌面版的紀錄；瀏覽器網站的 Webhook 需在桌面版重新設定，App 無法自行讀取其他瀏覽器或網站來源的儲存空間。

## 功能

- 最多 5 位玩家抽籤，主位不重複。
- 少於 5 人時會分配副位，並避免任兩位玩家出現相同的 `{主位, 副位}` 無序組合。
- 可為玩家指定偏好主位；若多人指定相同位置會阻擋抽籤。
- 支援獨立的單次抽英雄模式，可依上路、打野、中路、下路、輔助篩選英雄池。
- 歷史玩家、統計紀錄、深淺色偏好會保存在瀏覽器 localStorage。
- 支援統計視窗、清空紀錄、複製結果與快捷鍵。
- 可在瀏覽器設定 Discord Webhook，玩家分路抽籤成功後自動傳送結果。

## Discord 同步

1. 在 Discord 的目標文字頻道建立 Webhook 並複製網址，操作可參考 [Discord 官方說明](https://support.discord.com/hc/zh-tw/articles/228383668)。
2. 按右上角齒輪「設定」，選擇「Discord → 管理 Webhook」，填寫自訂名稱與 Webhook 網址後按「儲存設定」。名稱由你填寫，新增與編輯只檢查網址格式，不向 Discord 查詢或發送測試訊息。
3. 在設定視窗開啟「Discord 自動同步」。如有多組 Webhook，可選擇本次傳送位置；每次只傳送到選取的一組。儲存設定不會自動開啟同步，也不會重送舊結果。主畫面只顯示同步狀態，點擊該狀態可直接開啟 Discord 設定。
4. 玩家分路抽籤成功後，瀏覽器直接向 Discord 傳送玩家主位與副位，不包含抽籤時間。重新抽籤也會傳送新結果；抽英雄不會傳送。網頁上的抽籤時間照常顯示。

設定頁可編輯名稱、更換網址、刪除單組或清除全部。編輯時網址留空會保留原網址；儲存與新增不會變更正在選取的其他 Webhook。刪除目前選取的一組會關閉同步，避免結果意外送到其他頻道。舊版設定的網址、名稱與啟用狀態會保留。

網站版的 Webhook 網址仍只保存在目前網站來源的瀏覽器 localStorage（`lolDiscordSync`），不會寫入專案、送到 Cloudflare 或分享給其他訪客；桌面版則使用上述 AppData 加密儲存。網址輸入欄位會遮蔽內容，儲存後清空。本機預覽與正式網站的設定各自獨立。網站儲存的網址仍是本機可讀取的憑證，共用電腦請清除設定；撤銷 Webhook 則需到 Discord 刪除。

傳送失敗不影響抽籤結果或統計，結果頁會顯示原因並提供「重送本次結果」。不會自動重送，以免訊息重複；遇到逾時或無法確認已送出的情況，請先查看 Discord 頻道。Discord 接受訊息後才顯示傳送成功，玩家名稱中的 `@everyone` 等文字不會觸發提及通知。

開發測試使用虛構 Webhook 與替代 fetch，不向 Discord 發出訊息。實際驗收請使用自己的測試頻道，確認抽籤、重新抽籤、停用與切換目的地。

## 開發

```bash
npm install
npm run dev
```

完整更新英雄與路線資料（建議使用）：

```bash
npm run update:data
npm test
npm run build
```

此指令會先更新英雄資料，再更新路線資料；英雄更新失敗時會停止。完成後兩份 JSON 都需一併提交並部署，線上網站才會顯示新版。本機更新不會自動部署。

只更新英雄資料：

```bash
npm run update:champions
```

更新腳本會讀取 Data Dragon 最新版本的 `zh_TW` 英雄資料，驗證後寫入 `src/data/champions.json`。資料會在 Vite 建置時打包進靜態網站；更新檔案後提交並推送到 Cloudflare Pages 連接的 production branch，即可由 Cloudflare Pages 重新建置上線。若下載或驗證失敗，既有資料不會被覆蓋。

更新英雄位置資料（也會先更新英雄資料）：

```bash
npm run update:champion-positions
```

位置更新腳本會讀取 CommunityDragon 的英雄統計資料，以本機 Data Dragon 快照中的數字 `key` 對照穩定英雄 ID，驗證五路與合理數量後寫入 `src/data/champion-positions.json`。若來源格式改變、ID 無法對照或資料驗證失敗，腳本會停止且保留上一版快照。更新 Data Dragon 後，應接著更新英雄位置資料，確保兩份快照的版本一致。

英雄圖片使用對應版本的 Data Dragon CDN。英雄抽籤不會寫入玩家分路統計或 localStorage，也不包含玩家偏好、排除名單或英雄統計。

資料來源：[Riot Data Dragon](https://developer.riotgames.com/docs/lol#data_dragon)、[CommunityDragon](https://www.communitydragon.org/)。

## 建置

```bash
npm run build
npm run preview
```

## Cloudflare Pages 部署

此專案是純靜態 Vite 網站，建置完成的 `dist/` 可直接部署至 Cloudflare Pages。

1. 在 Cloudflare Dashboard 開啟 **Workers & Pages**，選擇 **Create application** → **Pages** → **Connect to Git**。
2. 連接 GitHub 後選擇此 repository；即使是私人 GitHub repository，也可以透過 Cloudflare Pages Git integration 部署。
3. 在建置設定填入：
   - **Framework preset**：`Vite`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **Production branch**：`main`
4. 儲存並開始部署。之後推送至 `main` 的 commit 會建立 production deployment；其他分支可建立 preview deployment。

此網站不需要 Cloudflare 環境變數或 API key。請勿把 `.env`、token 或其他機密提交到 Git。

## 快捷鍵

僅在抽籤結果頁可使用：

- `Z`：返回設定，保留目前來源與名單
- `X`：返回設定並切換為自訂主位偏好
- `C`：複製結果
- `Enter`：再抽一次
## 測試

```bash
npm test
```

## 網站與舊版 localStorage 相容性

網站版沿用舊版單頁工具的 key；桌面版僅在首次移轉時讀取這些舊鍵，驗證成功後清除：

- 統計：`lolDrawStats`
- 主題：`lolTheme`

若瀏覽器內仍有舊主題 key `lol-theme`，第一次儲存主題時會移除。
