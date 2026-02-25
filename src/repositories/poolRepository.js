class PoolRepository {
  constructor(db) {
    this.db = db;
    this.getStmt = db.prepare('SELECT players_json FROM pool_sessions WHERE guild_id = ?');
    this.upsertStmt = db.prepare(`
      INSERT INTO pool_sessions (guild_id, players_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        players_json = excluded.players_json,
        updated_at = excluded.updated_at
    `);
  }

  getPool(guildId) {
    const row = this.getStmt.get(guildId);
    if (!row) return [];

    try {
      const parsed = JSON.parse(row.players_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  setPool(guildId, players) {
    this.upsertStmt.run(guildId, JSON.stringify(players), Date.now());
  }

  add(guildId, name) {
    const pool = this.getPool(guildId);
    if (pool.includes(name)) return { ok: false, reason: 'duplicate', pool };
    if (pool.length >= 5) return { ok: false, reason: 'full', pool };

    const next = [...pool, name];
    this.setPool(guildId, next);
    return { ok: true, pool: next };
  }

  remove(guildId, name) {
    const pool = this.getPool(guildId);
    if (!pool.includes(name)) return { ok: false, reason: 'not_found', pool };

    const next = pool.filter((p) => p !== name);
    this.setPool(guildId, next);
    return { ok: true, pool: next };
  }

  clear(guildId) {
    this.setPool(guildId, []);
  }
}

module.exports = { PoolRepository };
