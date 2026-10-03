# LOL 抽籤工具

React + Vite 版英雄聯盟抽籤工具。此專案現在只維護靜態 Web 版本，不再包含 Discord Bot 技術路線。

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
2. 按網站右上角齒輪「連動設定」，填寫自訂名稱與 Webhook 網址後按「儲存設定」。名稱由你填寫，新增與編輯只檢查網址格式，不向 Discord 查詢或發送測試訊息。
3. 返回抽籤頁，開啟「Discord 同步」。如有多組 Webhook，可選擇本次傳送位置；每次只傳送到選取的一組。儲存設定不會自動開啟同步，也不會重送舊結果。
4. 玩家分路抽籤成功後，瀏覽器直接向 Discord 傳送玩家主位與副位，不包含抽籤時間。重新抽籤也會傳送新結果；抽英雄不會傳送。網頁上的抽籤時間照常顯示。

設定頁可編輯名稱、更換網址、刪除單組或清除全部。編輯時網址留空會保留原網址；儲存與新增不會變更正在選取的其他 Webhook。刪除目前選取的一組會關閉同步，避免結果意外送到其他頻道。舊版設定的網址、名稱與啟用狀態會保留。

Webhook 網址只保存在目前網站來源的瀏覽器 localStorage（`lolDiscordSync`），不會寫入專案、送到 Cloudflare 或分享給其他訪客。網址輸入欄位會遮蔽內容，儲存後清空。本機預覽與正式網站的設定各自獨立。網址仍是本機可讀取的憑證，共用電腦請清除設定；撤銷 Webhook 則需到 Discord 刪除。

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

- `Z`：修改名單
- `X`：修改偏好
- `C`：複製結果
- `Enter`：再抽一次
## 測試

```bash
npm test
```

## localStorage 相容性

React 版沿用舊版單頁工具的 key：

- 統計：`lolDrawStats`
- 主題：`lolTheme`

若瀏覽器內仍有舊主題 key `lol-theme`，第一次儲存主題時會移除。
