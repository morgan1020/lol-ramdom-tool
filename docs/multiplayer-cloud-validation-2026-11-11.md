# 雲端房間第二階段驗證紀錄

日期：2026-11-11（台灣時間）。開發分支：`codex/multiplayer-cloud-stage2`，承接第一階段 `16ca6b1`。

## 本次完成

Cloudflare Worker 與每房獨立 SQLite Durable Object、桌面 WSS 房間路由、邀請複製與貼上、持久化 session／操作去重、休眠恢復、心跳偵測半開連線、初次握手回覆遺失後恢復原席位，以及獨立 Windows Preview 包。

公網資源使用獨立名稱 `lol-random-sync-rooms-preview`，不修改既有 Cloudflare Pages 網站。GitHub 推送與 Release 發布不在本次範圍內。

## 已執行驗證

| 項目 | 結果與範圍 |
| --- | --- |
| `npm run room:test` | 52／52 通過，涵蓋既有本機房間、邀請、主程序、IPC、視窗生命週期與新的心跳／握手恢復 |
| `npm run room:cloud:test` | 12／12 通過；使用真 Miniflare／workerd 與 SQLite，不是模擬 Durable Object 類別 |
| Cloudflare runtime 生命週期 | 雙 WebSocket hibernation 後恢復、SQLite 重建 runtime 後恢復 session／版本／去重紀錄、alarm／tombstone／限流均通過 |
| 初次握手 ACK 遺失 | 真本機 WebSocket 與 workerd 注入丟棄 ACK／斷線後，同憑證重試恢復原 member，沒有多出席位；錯誤身分與房間重播被拒絕 |
| `npm run build` | Vite 建置通過 |
| `electron scripts/sync-room-ui-smoke.js` | 本機 `/sync`、真 Electron IPC、合成大廳，畫面流程及原網站模式回歸通過 |
| `electron scripts/sync-room-ui-smoke.js --cloud` | 本機 Cloudflare `/rooms`、真 Electron IPC、邀請／結果一致／重連／關房通過；統計未變、LCU 寫入 0、Discord 傳送 0 |
| Wrangler dry-run | Worker 與 SQLite migration、rate-limit binding 打包通過；乾跑不等於雲端部署 |
| Windows Preview | `1.5.0-preview.1` x64 資料夾打包通過；asar 中 client、邀請 helper 及前端入口與已驗證來源一致 |
| 預覽 EXE 實際啟動 | 啟動打包後的 EXE，確認 `lol-draw://app/` 載入、可切換多人房間並顯示建立／加入；使用指定隔離 profile，未連線房間 |

本次依變更範圍驗證，未將上述結果描述成完整專案測試通過，也未執行真實多人 LCU 套用或乾淨 Windows 安裝／升級。

## 可搬移的 Windows 產物

- ZIP：`release/cloud-preview/LOL-Random-Tool-1.5.0-preview.1-Windows-x64.zip`
- 大小：160,044,379 bytes。
- SHA-256：`364eaaac690c5c282a453de519650183e81b9ffa3e1d54fbcef98bbb4152811c`
- 解壓後請保留整個 `LOL-Random-Tool-Preview/` 資料夾，再執行其中的 EXE。
- 預覽包使用不同的 package name、productName 與 appId；未簽章，沒有發布為公開 Release。

首次打包遇到沙箱外下載快取權限問題，改用已安裝的 Electron 與專案內忽略的 builder cache 完成。快取內加上 CommonJS 模組宣告，避免圖示工具繼承本專案 ESM；未修改第三方工具原始碼。最終打包成功，產物比對通過。

UI 報告與截圖分別位於 `release/sync-room-ui-smoke/`、`release/sync-room-cloud-ui-smoke/`；CLI 只輸出去識別報告，不包含房碼、memberId、玩家名稱或 session token。

打包啟動證據位於 `release/packaged-startup-smoke/result.json` 與 `room.png`。沙箱內第一次啟動以 `0x80000003` 結束，改由授權的沙箱外程序使用隔離 profile 後通過。確認資料寫入指定隔離目錄；尚未驗證省略隔離參數時的預設 AppData 路徑。測試未操作 LoL 或 Discord，結束後已關閉程序。

## 公網與實體機狀態

本機 runtime、桌面整合及公網預覽部署已完成。使用者完成補充 Worker script／route 權限的 OAuth 授權後，Wrangler 部署成功。

- Worker：`lol-random-sync-rooms-preview`。
- 實際服務位址及部署 Version ID 僅保留於本機部署紀錄，不納入公開文件。
- HTTPS `/health` 實際回傳 `{"ok":true,"protocol":1}`。
- 2026-11-11 13:36（台灣時間）公網 WSS 合成測試通過：建立、加入、未授權操作拒絕、抽籤結果一致、同席位重連、清除準備及結果、結果版本遞增、關房。
- 報告：`release/sync-room-cloud-smoke/report-1794375403984.json`；`ok: true`，LCU 寫入 0，Discord 傳送 0。

公網測試使用同一台電腦的兩個用戶端，確實經過遠端 TLS 與已部署 Worker，不等同於兩台實體電腦驗收。

兩台實體 Windows 電腦、不同網路與實際斷網復原仍待按 [雲端預覽指南](multiplayer-cloud.md) 手動驗收。服務不會因這些測試自動套用 LoL 分路或傳送 Discord。
