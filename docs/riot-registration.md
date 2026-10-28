# Riot 產品登記狀態

更新日期：2026-10-29（台灣時間）。依據使用者提供的 Firefox 畫面、可存取性文字與完成操作的說明記錄；本次沒有代為操作 Portal。

| 項目 | 狀態 |
| --- | --- |
| 產品名稱 | LOL Random Tool |
| App ID | `898873` |
| 產品類型 | Production 申請 |
| 遊戲／群組 | League of Legends／Default Group |
| 產品網址 | https://lol-ramdom-tool.pages.dev/ |
| 產品登記 | 已成功建立申請 |
| 網站所有權驗證 | 已通過，Portal 顯示 `Verification code found and validated!` |
| 產品說明 | 已改為精簡英文並儲存，Portal 顯示 `Application updated successfully!` |
| 審核狀態 | **Pending Review（等待審核）** |
| Riot 核准／LCU 用途確認 | **尚未取得**；登記與網站驗證成功不等於產品或端點用途已獲核准 |

[產品詳細資料](https://developer.riotgames.com/app/898873/info) · [產品訊息](https://developer.riotgames.com/app/898873/messages)（需擁有者登入）

## 已完成的步驟

1. 先前由內建瀏覽器提交 Production 申請，出現 `Selected app type is not available`，未建立產品。
2. 使用者改以 Firefox 建立產品 `898873`，進入網站所有權驗證。
3. 僅 `public/riot.txt` 以提交 `b6ef909` 推送至 main，Cloudflare Pages 部署成功；單斜線與雙斜線驗證網址均回傳正確的純文字內容。
4. 使用者按 VERIFY URL，驗證通過，狀態為 Pending Review。
5. 原先較長的產品說明未完整保存。使用者改貼下方精簡版並儲存；最新畫面顯示完整最後一句，四個 GET 與可選 PUT 用途均已揭露。

## Portal 目前保存的產品說明

```text
Free, non-commercial LoL role/champion randomizer: website and Windows app. Uses Data Dragon/CommunityDragon static data and local LCU only; no Riot Web API key or RSO.

LCU reads:
GET /lol-gameflow/v1/gameflow-phase
GET /lol-lobby/v2/lobby
GET /lol-summoner/v1/current-summoner
GET /lol-summoner/v1/summoners/{summonerId}

Optional write, OFF by default:
PUT /lol-lobby/v2/lobby/members/localMember/position-preferences

Only with user opt-in, update that user's own role preferences after a draw. Verify account, party and supported lobby before writing; read back afterward. No teammate writes, auto-queue, champion selection or automatic retries.

No memory reading, hidden-player data, MMR, fees or ads. Credentials stay in main-process memory; stats stay local. Includes Riot non-endorsement notice. Public release is on hold.

Please confirm whether these LCU endpoints, especially the optional write, are permitted.
```

## 接下來

- 保留網站的 `riot.txt`，留意該產品 MESSAGES 的審核通知或補件要求。
- 等待 Riot 對產品與 LCU 端點用途（尤其可選 PUT）的回覆，不宣稱已獲核准。
- 使用者於 2026-10-29 決定在 Pending Review 期間公開原始碼並發布 Windows App。公開不代表 Riot 已核准；上述英文說明為登記時保存的內容，包含當時暫緩發布的歷史狀態。後續產品狀態須與 Portal 維護一致。
