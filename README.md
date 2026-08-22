# LOL 抽籤工具

React + Vite 版英雄聯盟抽籤工具。此專案現在只維護靜態 Web 版本，不再包含 Discord Bot 技術路線。

## 功能

- 最多 5 位玩家抽籤，主位不重複。
- 少於 5 人時會分配副位，並避免任兩位玩家出現相同的 `{主位, 副位}` 無序組合。
- 可為玩家指定偏好主位；若多人指定相同位置會阻擋抽籤。
- 支援獨立的單次抽英雄模式，使用 Riot Data Dragon 的台灣繁體中文資料。
- 歷史玩家、統計紀錄、深淺色偏好會保存在瀏覽器 localStorage。
- 支援統計視窗、清空紀錄、複製結果與快捷鍵。

## 開發

```bash
npm install
npm run dev
```

更新英雄資料：

```bash
npm run update:champions
```

更新腳本會讀取 Data Dragon 最新版本的 `zh_TW` 英雄資料，驗證後寫入 `src/data/champions.json`。資料會在 Vite 建置時打包進靜態網站；更新檔案後提交並推送到 Cloudflare Pages 連接的 production branch，即可由 Cloudflare Pages 重新建置上線。若下載或驗證失敗，既有資料不會被覆蓋。

英雄圖片使用對應版本的 Data Dragon CDN。英雄抽籤只使用基本英雄清單，不包含分路限制、玩家偏好、排除名單或英雄統計。

本工具為非官方粉絲工具，未獲 Riot Games 背書。League of Legends 與 Riot Games 為 Riot Games, Inc. 的商標。資料來源：[Riot Data Dragon](https://developer.riotgames.com/docs/lol#data_dragon)。

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
