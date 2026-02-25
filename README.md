# LOL Discord 抽籤機器人

此專案在原本網頁抽籤邏輯基礎上，新增 Discord Slash Command 機器人版本。

## 功能
- 候選名單管理：`/pool add|remove|list|from-voice|clear`
- 抽籤：`/draw`
- 統計：`/stats [name]`、`/resetstats`
- 抽籤規則與網頁版一致：
  - 最多 5 人
  - 主位隨機分配
  - 少於 5 人時分配副位，且主副組合不可重複
  - 統計加權：主位 +1、副位 +0.5

## 環境需求
- Node.js 20+
- Discord Bot Token 與應用程式設定
- Discord Developer Portal 開啟 `Server Members Intent`

## 安裝
```bash
npm install
cp .env.example .env
```

請填入 `.env`：
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `DB_PATH`（可保留預設 `./data/bot.sqlite`）

## 註冊指令
```bash
npm run register
```

### 主要指令範例
- `/pool add name:小明`
- `/pool add member:@小明`
- `/pool from-voice`（從你目前語音頻道匯入真人成員）
- `/pool list`
- `/draw`
- `/stats`

## 啟動機器人
```bash
npm run start
```

## 測試
```bash
npm test
```
