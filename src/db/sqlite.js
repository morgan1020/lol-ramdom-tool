const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function createDatabase(dbPath) {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const db = new Database(resolved);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pool_sessions (
      guild_id TEXT PRIMARY KEY,
      players_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stats (
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      top REAL NOT NULL DEFAULT 0,
      jungle REAL NOT NULL DEFAULT 0,
      mid REAL NOT NULL DEFAULT 0,
      adc REAL NOT NULL DEFAULT 0,
      support REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS draw_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}

module.exports = { createDatabase };
