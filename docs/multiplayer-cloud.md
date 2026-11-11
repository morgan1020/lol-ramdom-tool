# 多人同步房間雲端預覽

Windows 桌面 App 可透過 Cloudflare Worker 同步房間成員、準備狀態和分路抽籤結果。房間操作不寫入 LoL 分路、不累計統計，也不傳送 Discord 訊息。

## 在兩台 Windows 電腦試玩

1. 執行 `npm run room:preview:pack`，將 `release/cloud-preview/win-unpacked/` 整個資料夾複製或壓成 ZIP 傳給第二台電腦。解壓後從各自資料夾啟動 `LOL-Random-Tool-Preview.exe`，其餘檔案須和執行檔放在一起。預覽版為 `1.5.0-preview.1`，使用獨立於日常版的 App 識別與資料目錄。
2. A 開啟「多人同步房間」並選擇「建立房間」。輸入完整 Riot ID，例如 `預覽主持人#TW1`，在「同步服務位址」填入部署後的 `wss://YOUR_WORKER.workers.dev/rooms`，建立後按「複製邀請」。
3. B 選擇「加入房間」，填入另一個完整 Riot ID，將 A 給的三行邀請貼進「貼上朋友的邀請」，按「套用邀請」後核對網址和房碼，再按「加入並等候核准」。A 應看到 B 待核准，B 此時應無法準備。
4. A 核准 B，兩人各按「我準備好了」，由 A 按「開始抽籤」。核對兩台 App 上的抽籤次數與每位玩家的分路一致。
5. 讓 B 短暫斷網後恢復，核對它重連回原房間且成員沒有重複。連線變動後，兩人需重新確認準備。也可另開一間房短暫中斷 A 的網路，核對主持人於 60 秒寬限內成功恢復，或在寬限期後關房。
6. A 按「關閉房間」。B 應收到關房狀態，使用原邀請再次加入應失敗。

如要驗證跨網路，可讓其中一台電腦改用手機熱點。邀請只包含服務位址與房碼，應透過信任的管道分享。房間服務會暫存成員名稱與抽籤結果，預覽可使用測試名稱。

## 本機開發與部署

在專案根目錄執行。以部署輸出中的主機名稱取代範例的 `YOUR_WORKER.workers.dev`。

| 指令 | 用途 |
| --- | --- |
| `npm run room:cloud:dev` | 在 `ws://127.0.0.1:8788/rooms` 啟動本機 Cloudflare runtime。 |
| `npm run room:cloud:check` | Wrangler dry-run 打包檢查，產物放在 `release/cloud-worker/`。 |
| `npm run room:cloud:test` | 在本機 Cloudflare runtime 驗證房間通訊與生命週期。 |
| `npm run room:cloud:ui-smoke` | 使用隔離 Electron App、合成資料與本機 Cloudflare runtime 驗證房間介面。 |
| `npm run room:cloud:smoke -- --url wss://YOUR_WORKER.workers.dev/rooms` | 從同一台電腦以兩個測試用戶端驗證指定端點。 |
| `npm run room:demo -- --url wss://YOUR_WORKER.workers.dev/rooms` | 從同一台電腦開兩個隔離 App 手動試玩，可改填本機 Cloudflare 服務位址。 |
| `npm run room:preview:pack` | 產生獨立的 Windows x64 預覽資料夾。 |

登入預覽使用的 Cloudflare 帳號後，以 `npx wrangler whoami` 核對帳號。部署指令為 `npx wrangler deploy --config server/cloudflare/wrangler.jsonc`，設定中的 Worker 名稱為 `lol-random-sync-rooms-preview`。跨電腦使用 WSS，`ws://` 僅供本機 loopback 測試。

## 房間狀態與連線

- 桌面 App 輸入的服務位址以 `/rooms` 結尾。主程序在連線時附上 10 位十六進位房碼，Worker 依 `/rooms/<房碼>` 將 WebSocket 導向該房間專屬的 SQLite Durable Object。
- Durable Object 使用 WebSocket Hibernation API 維持連線，將房間狀態、工作階段與命令回覆寫入耐久儲存。工作階段憑證只儲存 SHA-256 雜湊，重送命令可使用已儲存的回覆。Electron 主程序每 25 秒送心跳，等待回覆上限為 10 秒。[Cloudflare WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- 第一次建立或加入前，主程序會生成高熵握手憑證；只有傳輸失敗或逾時時，會以同一憑證重試一次，避免回覆遺失造成重複席位。抽籤等房間操作不會自動重送。憑證不進入邀請或 renderer。
- 主持人意外斷線後保留 60 秒重連寬限。房間閒置達 2 小時會清理，心跳不延長期限。關房會清除房間、工作階段和命令回覆，另保留 2 小時的關房標記，避免舊邀請復用。標記只包含到期時間。
- Worker 對每個 IP 在各 Cloudflare 位置分別套用每 60 秒 60 次的近似連線速率限制。此設定沒有全域總房間數上限。[Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## 驗證進度

本機 Cloudflare runtime 的 12 項測試、52 項房間相關測試與隔離 Electron UI 冒煙測試已通過。遠端 WSS 的 CLI 冒煙測試可驗證部署端點與兩個合成用戶端的互動。兩台實體 Windows 電腦的連線、重連和結果同步仍待依上述流程手動驗收。
