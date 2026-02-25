# LOL 抽籤工具（Web + Discord Bot）

本專案目前有兩種型態：

1. **Web 單頁版**：[`英雄聯盟抽籤.html`](./英雄聯盟抽籤.html)
2. **Discord Bot 版**：Slash Commands + SQLite（沿用相同抽籤邏輯）

## 快速選擇你要用的型態

### A. Web 單頁版
- 直接開啟 `英雄聯盟抽籤.html` 即可使用
- 適合本機快速抽籤、免安裝

### B. Discord Bot 版
- 提供 `/pool`、`/draw`、`/stats` 等指令
- 支援 `/pool from-voice`（從目前語音頻道匯入成員）
- 完整人類使用手冊請看：[`README_DISCORD_BOT.md`](./README_DISCORD_BOT.md)

## Discord Bot 最短啟動步驟
```bash
npm install
cp .env.example .env
npm run register
npm run start
```

`.env` 必填：
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `DB_PATH`（預設 `./data/bot.sqlite`）

## 開發與測試
```bash
npm test
```
