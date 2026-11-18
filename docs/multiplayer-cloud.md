# 多人同步房間雲端預覽

Windows 桌面 App 從房主的 LoL 大廳讀取全隊。抽完可以複製結果，貼到 Discord 或其他群組。房主若啟用 Discord 自動同步，App 也會把每輪結果傳到選定頻道。使用 App 加入的玩家會自動套用各自的分路，每輪結果計入房主的本機統計。

個人部署位址、帳號識別與操作紀錄請存放在 Git 忽略的 `.local/` 目錄；公開文件僅使用範例。不要將 `.local/` 加入提交或發佈附件，也不要在文件中保存登入憑證。

## 在兩台 Windows 電腦試玩

請使用自己部署或由信任的主持人提供的服務位址（兩台皆使用相同位址）。以下僅為格式範例：

```text
wss://YOUR_WORKER.workers.dev/rooms
```

此流程需要新版桌面 App 和新版同步服務。先前打包的 ZIP 使用舊流程。

1. 執行 `npm run room:preview:pack`，將 `release/cloud-preview/win-unpacked/` 整個資料夾複製或壓成 ZIP 傳給第二台電腦。解壓後從各自資料夾啟動 `LOL-Random-Tool-Preview.exe`，其餘檔案須和執行檔放在一起。預覽版為 `1.5.0-preview.1`，使用獨立於日常版的 App 識別與資料目錄。
2. A 和 B 先加入同一個 LoL 組隊大廳。A 在「抽分路」切換到「多人房間」，選「建立房間」。依畫面填入同步服務位址後送出，App 會讀取完整隊伍名單。房主可在左下方設定 Discord 自動傳送及切換頻道。切回「單人」前，App 會請房主確認關房、加入者確認退出。
3. B 選擇「加入房間」並按「加入目前隊伍」。App 從本機 LoL 讀取 B 的完整 Riot ID 與隊伍名單，在相同同步服務查找房間。找不到或有多個房間時，A 點畫面上的房碼複製完整邀請，B 貼到「邀請或房碼」並按「申請加入」。
4. A 核准 B。A 可點玩家卡片指定主位，其他位置交給抽籤。B 按「我準備好了」後，A 直接按「開始抽籤」。核對兩台 App 的結果和各自 LoL 帳號的分路，再按「複製結果」分享。若有啟用 Discord 自動同步，也可核對選定頻道收到一則整隊結果。
5. 讓 B 短暫斷網後恢復，核對它重連回原房間且成員沒有重複。連線變動後，B 需重新確認準備。也可另開一間房短暫中斷 A 的網路，核對主持人於 60 秒寬限內成功恢復，或在寬限期後關房。
6. A 按「關閉房間」。B 應收到關房狀態，使用原邀請再次加入應失敗。

如要驗證跨網路，可讓其中一台電腦改用手機熱點。邀請只包含服務位址與房碼，應透過信任的管道分享。房間服務會暫存成員名稱與抽籤結果。

在「同步服務設定」可填入自己的 WSS 位址。測試或自行發行時可用桌面程序的 `LOL_ROOM_SERVICE_URL` 設定預設服務。雙機測試包可在打包時透過 Electron 的 resources/room-service.json 預設指定服務，一般建置仍可手動設定。本機雙視窗會自動使用隔離的本機服務。

同隊索引使用排序後的完整 Riot ID 摘要比對，記錄房碼與 10 分鐘期限。主持人重新讀取 LoL 大廳時更新，關房時移除。摘要只用於找房，主持人仍須核准加入。App 只在按「加入目前隊伍」時查找。

## 有些隊友沒裝 App

- 全隊從 LoL 大廳加入抽籤名單，只有使用 App 加入的非房主玩家需要按準備。其他人從群組訊息看結果，再到 LoL 手動調整。
- 房主在獨立的待核准清單處理加入申請。核准前，房主仍可依正式名單抽籤，既有結果與準備狀態照常保留。房主 App 須與支援待核准清單的同步服務搭配使用。
- 房主與已準備玩家的 App 核對目前登入帳號與完整隊伍，通過後才套用自己的分路。遇到不支援的模式或套用失敗，畫面會提示手動調整。
- 加入者以自己 App 的「我準備好了」授權套用。取消準備、斷線或房間名單與設定變更後，須重新確認。房主每次從自己的 App 發起抽籤時，只授權該輪結果。
- 房主每次抽籤前會重新讀取大廳。隊伍變動時，先更新名單並要求已加入的非房主玩家重新準備。若有 App 成員已離開 LoL 大廳，房主先將該成員移出同步連線，再重新讀取。
- Webhook 傳送失敗時，請先查看 Discord 頻道。App 保留抽籤結果，可按「複製結果」分享。

## 本機手動試玩

執行 `npm run room:demo` 會開啟房主和加入者兩個視窗，內含同一份五人合成大廳。房主按「建立房間」，加入者按「加入目前隊伍」，核准後按準備，再由房主抽籤。兩個視窗會模擬套用。可直接複製結果，或在隔離設定中開啟預填的模擬 Discord 頻道，再抽一輪測試自動分享。

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
- 雲端房間最多同時接受 5 條未驗證的一般握手。新版桌面 App 重連時會先提供現有憑證，每個有效工作階段各有一個待完成的重連名額。新加入與舊版 App 的重連仍使用一般名額，所有連線仍受服務入口的 IP 限流。
- 主持人意外斷線後保留 60 秒重連寬限。房間閒置達 2 小時會清理，心跳不延長期限。關房會清除房間、工作階段和命令回覆，另保留 2 小時的關房標記，避免舊邀請復用。標記只包含到期時間。
- Worker 對每個 IP 在各 Cloudflare 位置分別套用每 60 秒 60 次的近似連線速率限制。此設定沒有全域總房間數上限。[Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## 驗證進度

本機 Cloudflare runtime 的 12 項測試、52 項房間相關測試與隔離 Electron UI 冒煙測試已通過。2026-11-11 已對私人預覽端點執行遠端 WSS CLI 冒煙測試，兩個合成用戶端的建立、加入、權限、結果一致、原席位重連、準備狀態重置、結果版本遞增與關房皆通過；HTTPS 健康檢查回傳 `ok: true, protocol: 1`。實際端點不收錄於公開文件，上方範例不是可直接使用的服務。此驗證由同一台電腦連到雲端服務；兩台實體 Windows 電腦的連線、重連和結果同步仍待依上述流程手動驗收。
