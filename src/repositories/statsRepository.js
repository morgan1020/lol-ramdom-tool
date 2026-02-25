const { positions } = require('../domain/draw');

const columnByPosition = {
  上路: 'top',
  打野: 'jungle',
  中路: 'mid',
  下路: 'adc',
  輔助: 'support'
};

class StatsRepository {
  constructor(db) {
    this.db = db;
    this.getAllStmt = db.prepare('SELECT name, top, jungle, mid, adc, support FROM stats WHERE guild_id = ?');
    this.getOneStmt = db.prepare('SELECT name, top, jungle, mid, adc, support FROM stats WHERE guild_id = ? AND name = ?');
    this.upsertPlayerStmt = db.prepare(`
      INSERT INTO stats (guild_id, name, top, jungle, mid, adc, support, updated_at)
      VALUES (?, ?, 0, 0, 0, 0, 0, ?)
      ON CONFLICT(guild_id, name) DO NOTHING
    `);

    this.incStmtByColumn = {
      top: db.prepare('UPDATE stats SET top = top + ?, updated_at = ? WHERE guild_id = ? AND name = ?'),
      jungle: db.prepare('UPDATE stats SET jungle = jungle + ?, updated_at = ? WHERE guild_id = ? AND name = ?'),
      mid: db.prepare('UPDATE stats SET mid = mid + ?, updated_at = ? WHERE guild_id = ? AND name = ?'),
      adc: db.prepare('UPDATE stats SET adc = adc + ?, updated_at = ? WHERE guild_id = ? AND name = ?'),
      support: db.prepare('UPDATE stats SET support = support + ?, updated_at = ? WHERE guild_id = ? AND name = ?')
    };

    this.resetStmt = db.prepare('DELETE FROM stats WHERE guild_id = ?');
    this.logDrawStmt = db.prepare('INSERT INTO draw_log (guild_id, result_json, created_at) VALUES (?, ?, ?)');
  }

  upsertPlayer(guildId, name) {
    this.upsertPlayerStmt.run(guildId, name, Date.now());
  }

  applyDraw(guildId, drawResults) {
    const now = Date.now();

    this.db.transaction(() => {
      for (const result of drawResults) {
        this.upsertPlayer(guildId, result.name);
        this.incStmtByColumn[columnByPosition[result.main]].run(1, now, guildId, result.name);
        if (result.secondary) {
          this.incStmtByColumn[columnByPosition[result.secondary]].run(0.5, now, guildId, result.name);
        }
      }
      this.logDrawStmt.run(guildId, JSON.stringify(drawResults), now);
    })();
  }

  getStats(guildId, name) {
    const rows = name ? this.getOneStmt.all(guildId, name) : this.getAllStmt.all(guildId);
    return rows.sort((a, b) => {
      const totalA = positions.reduce((sum, pos) => sum + (a[columnByPosition[pos]] || 0), 0);
      const totalB = positions.reduce((sum, pos) => sum + (b[columnByPosition[pos]] || 0), 0);
      if (totalA !== totalB) return totalB - totalA;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
  }

  reset(guildId) {
    this.resetStmt.run(guildId);
  }
}

module.exports = { StatsRepository };
