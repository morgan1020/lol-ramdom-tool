# 授權範圍與第三方聲明

本專案的原始程式碼及原創文件採用根目錄的 [MIT License](LICENSE)。以下第三方遊戲素材、資料、商標與軟體套件不因收錄於此專案而改採本專案的 MIT 授權，各自依原權利人條款使用。

## Riot Games 與 CommunityDragon

League of Legends、英雄名稱、英雄圖片、遊戲分路圖示及相關遊戲素材與商標的權利屬 Riot Games 或其各自權利人。CommunityDragon 提供資料整理與存取服務，不代表將 Riot 素材重新授權為 MIT。原始素材、遊戲資料及衍生快照皆排除於本專案 MIT 授權範圍之外。

| 檔案／資源 | 來源與處理方式 | 本專案使用情形 |
| --- | --- | --- |
| `assets/roles/svg/position-*.svg` | [CommunityDragon 靜態 SVG](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/)，2026-10-25 擷取；移除外部 `glow.css` 的 XML stylesheet 宣告 | 網站與 App 的五路圖示；保留原圖形、透明度及金色，詳見 [來源紀錄](assets/roles/svg/README.md) |
| `assets/roles/Top_icon.png`、`Jungle_icon.png`、`Middle_icon.png`、`Bottom_icon.png`、`Support_icon.png` | 舊版沿用的 LoL 分路圖示；2026-04-27 提交 `286f486` 加入，歷史未記錄原始下載網址，不臆測特定下載來源 | 保留於原始碼；目前 `RoleIcon.jsx` 使用上述 SVG，這五個 PNG 不由目前介面匯入。仍按第三方遊戲素材處理，未納入 MIT |
| `src/data/champions.json` | [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)，由 `scripts/update-champions.mjs` 取得並整理 `zh_TW` 英雄資料；版本及更新時間保留於 JSON | 英雄資料快照隨網站與 App 打包 |
| 英雄圖片（`https://ddragon.leagueoflegends.com/cdn/<版本>/img/champion/<ID>.png`） | Riot Data Dragon CDN；網址由英雄資料快照指定 | 執行時由 CDN 載入；圖片本身未下載至此儲存庫 |
| `src/data/champion-positions.json` | [CommunityDragon 英雄統計來源](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champion-statistics/global/default/rcp-fe-lol-champion-statistics.js)，由 `scripts/update-champion-positions.mjs` 整理；來源 URL、SHA-256 及對應 Data Dragon 版本保留於 JSON | 英雄分路快照隨網站與 App 打包 |

適用政策與來源：[Riot Developer Policy](https://developer.riotgames.com/docs/lol#developer-api-policy)、[Riot Legal Jibber Jabber](https://www.riotgames.com/en/legal)、[CommunityDragon](https://www.communitydragon.org/)。使用者與再散布者須自行遵守適用條款；本聲明不代表已取得 Riot 審核、登記或個別授權。

LOL Random Tool is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## 專案骰子圖示

`public/favicon-dice.png` 由專案擁有者使用 ChatGPT Image 文生圖產生（擁有者於 2026-10-29 確認），非取自 Riot／CommunityDragon。此圖示隨本專案以 MIT 條款提供。

## Discord 圖示

`src/components/UiIcon.jsx` 的 Discord SVG path 取自 [Simple Icons 的 discord.svg](https://github.com/simple-icons/simple-icons/blob/develop/icons/discord.svg)，以 JSX 內嵌並使用目前文字色呈現。Simple Icons 依 [CC0 1.0 Universal](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md) 提供；此部分保留 CC0，不因所在程式檔案採 MIT 而改變原條款。Discord 品牌與商標權利仍屬原權利人；CC0 不授予商標權。

## 第三方軟體

以下為此版本 lockfile／本機安裝所記錄的主要套件，版本更新時應同步檢查。完整相依關係見 `package-lock.json`；此表不是完整的遞迴相依套件清單。

| 套件／元件 | 目前版本 | 授權與原始來源 |
| --- | --- | --- |
| React、React DOM | 19.2.7 | MIT；[React](https://github.com/facebook/react) |
| scheduler | 0.27.0 | MIT；[React scheduler](https://github.com/facebook/react/tree/main/packages/scheduler) |
| Electron | 45.0.0 | MIT；[Electron](https://github.com/electron/electron) |
| Chromium、Node.js 及 Electron 內含元件 | 隨 Electron 版本 | 各自授權；以 Electron 隨附的 `LICENSES.chromium.html` 與原授權檔為準，不全屬 MIT |
| Vite | 7.3.7 | MIT；[Vite](https://github.com/vitejs/vite)；建置工具 |
| @vitejs/plugin-react | 5.2.0 | MIT；[Vite React plugin](https://github.com/vitejs/vite-plugin-react)；建置工具 |
| electron-builder | 26.18.0 | MIT；[electron-builder](https://github.com/electron-userland/electron-builder)；打包工具，其 NSIS 等工具及其他相依元件各有自己的條款 |

Windows 產物的執行檔旁提供本聲明與 `LICENSE`。React、React DOM、scheduler 原授權保留於 `resources/app.asar` 的對應 `node_modules/<套件>/LICENSE`；Electron 原授權保留為執行檔旁的 `LICENSE.electron.txt`，內含元件聲明保留為 `LICENSES.chromium.html`。以下另附前端 bundle 使用的 React／React DOM／scheduler 完整 MIT 聲明，方便網站與 App 再散布時一併保留。

### React／React DOM／scheduler

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 再散布

再散布本專案原始碼或建置產物時，請一併保留 `LICENSE`、本聲明及相關第三方原授權。MIT 僅授予本專案有權授權的部分，不授予 Riot 商標、遊戲素材或第三方套件超出其原條款的權利。
