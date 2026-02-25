# Discord Bot Handoff Guide

## Overview
This bot provides League role drawing in Discord using slash commands, reusing the same core logic as the original web tool.

Key rules:
- Max 5 players per draw pool
- Unique main role assignment
- Secondary role for `<5` players, with unique main+secondary combinations
- Stats weighting: main `+1`, secondary `+0.5`

## Core Commands
- `/pool add name:<text>`
- `/pool add member:@user`
- `/pool remove name:<text>`
- `/pool list`
- `/pool from-voice` (imports non-bot members from requester's current voice channel)
- `/pool clear` (manager only)
- `/draw`
- `/stats [name]`
- `/resetstats` (manager only)

## Runtime Requirements
- Node.js `20+`
- `.env` with:
  - `DISCORD_TOKEN`
  - `CLIENT_ID`
  - `GUILD_ID`
  - `DB_PATH` (default `./data/bot.sqlite`)
- Discord Developer Portal:
  - `Server Members Intent` enabled

## Start / Update Flow
1. `npm install`
2. `npm run register`
3. `npm run start`
4. If slash commands look stale in client, press `Cmd+R` and re-run register.

## Important Files
- `src/index.js`: client setup and intents
- `src/commands/index.js`: slash command handlers
- `src/domain/draw.js`: draw algorithm
- `src/domain/poolMerge.js`: candidate merge logic for `from-voice`
- `src/repositories/*`: SQLite persistence
- `tests/*.test.js`: logic tests

## Validation Checklist
1. `npm test` passes.
2. `/pool from-voice` fails when requester is not in voice.
3. `/pool from-voice` imports only human users.
4. Pool never exceeds 5 players.
5. `/draw` and `/stats` update correctly after import.
