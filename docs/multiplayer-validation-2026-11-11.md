# 多人房間第一階段驗證紀錄

日期：2026-11-11（台灣時間）。分支：`codex/multiplayer-sync-stage1`。此紀錄僅描述本次開發驗證，不代表公開版本已更新。

## 交付範圍

桌面多人房間頁、本機 WebSocket 原型服務、1～5 人核准／準備／抽籤、成員移除、主持人關房、結果版本與操作去重、重連及關窗離房。另提供可同機操作的兩份隔離 App 示範。

交叉審查後修正了舊連線失敗干擾新連線、舊 resume 失敗污染新房間、接管仍在線 session 未撤銷準備、房間快照格式驗證不足、離開按鈕只斷線未退房等問題。正常關窗最多等待一秒離房；主持人異常斷線則以服務端寬限回收房間。

原模式回歸檢查另發現抽英雄切換路線呼叫已不存在的 `setError`，已改用既有通知移除介面，並在 UI 驗證中確認切換中路與英雄池同步。

## 實際驗證

| 指令／檢查 | 結果與界線 |
| --- | --- |
| `npm run room:test` | 36／36 通過；包含純核心、主程序 client、IPC、視窗生命週期與真實本機 WebSocket 測試 |
| `npm run build` | Vite 建置通過 |
| `electron scripts/sync-room-ui-smoke.js` | 真實本機 WebSocket、真實桌面 IPC、合成 LoL 名單；核准、結果一致、切頁保留、重連、移除與雙端關房通過 |
| UI 原模式回歸 | 桌面與無 preload 的網站視窗均可切換抽分路／抽英雄並選中路；網站未出現多人房間或 native API |
| UI 版面 | 深淺色及 800×640 窗口檢查通過，房間可捲動、無水平溢出；無 console error |
| `node scripts/sync-room-demo.mjs --check` | 兩個獨立 profile 的 Electron 視窗實際啟動、選頁、預填合成身分與服務位址後正常關閉 |
| 修改過的主程序／腳本語法檢查 | 通過；JSX 由 Vite 建置驗證 |

UI 測試確認統計前後相同、LCU 寫入 0 次、Discord 傳送 0 次。截圖及機器可讀報告放在 Git 忽略的 `release/sync-room-ui-smoke/`；示範 profile 在 `release/sync-room-demo/`。未將 profile、玩家資料、session token 或 AppData 提交到 Git。

本次依受影響範圍執行房間相關測試及局部原模式 UI 回歸，沒有執行完整 `npm test`、完整舊 UI／儲存 smoke 或 Windows 安裝包建置。

## 依賴檢查與剩餘界線

新增 `ws` 8.22.2 僅用於原型服務與測試，為開發依賴，不隨桌面 App 打包。Node 最低版本改為 22.12，以支援 Vite 及內建 WebSocket，lockfile 與第三方聲明已同步。

安裝後 `npm audit --json` 回報 **6 項 moderate**，來自既有 `electron-builder` 的 `minimatch` 相依鏈；沒有 high／critical。本次 lockfile 除 Node 宣告與新增 `ws` 外未變更其他套件。未使用會改變主版本或降版的 `audit fix --force`；打包依賴升級需另外評估與驗證。

尚未驗證：跨電腦 TLS 連線、Cloudflare Worker／Durable Object 部署、真實多人 LCU、統計持久化去重、主持人 Discord 發送、乾淨 Windows 安裝／升級。本階段只同步結果，這些項目不包含在已完成宣稱內。啟動及手動操作見 [第一階段說明](multiplayer-stage1.md)。
