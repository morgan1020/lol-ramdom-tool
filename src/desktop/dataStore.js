import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { normalizeDiscordSettings, DEFAULT_DISCORD_SYNC } from '../domain/discordSettings.js';
import { getActiveDiscordDestination, upsertDiscordDestination, selectDiscordDestination, removeDiscordDestination } from '../domain/discordDestinations.js';
import { sendDiscordDraw } from '../domain/discordSync.js';
import { validateStats, parseStatsBackup, importStats, createStatsBackup } from '../domain/statsBackup.js';

export class DataError extends Error {}
const keys = ['lolDrawStats', 'lolDiscordSync', 'lolTheme', 'lol-theme', 'lolAutoApplyRoles'];
const emptyDiscord = () => ({ ...DEFAULT_DISCORD_SYNC, destinations: [] });

function checkPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['theme', 'autoApplyRoles', 'drawMode'].includes(key)) || ![null, 'light', 'dark'].includes(value.theme) || typeof value.autoApplyRoles !== 'boolean' || !['random', 'client', 'custom'].includes(value.drawMode)) throw new DataError('App 偏好設定格式錯誤');
  return { theme: value.theme, autoApplyRoles: value.autoApplyRoles, drawMode: value.drawMode };
}

function legacyHash(legacy) {
  return createHash('sha256').update(JSON.stringify(keys.map((key) => legacy[key] ?? null))).digest('hex');
}
const valueHash = (value) => createHash('sha256').update(value).digest('hex');

export class DesktopDataStore {
  constructor({ directory, encryption, io = fs, send = sendDiscordDraw }) {
    this.directory = directory;
    this.file = path.join(directory, 'application-data.json');
    this.encryption = encryption;
    this.io = io;
    this.send = send;
    this.state = null;
    this.queue = Promise.resolve();
    this.failed = false;
  }

  serialize(operation) {
    const result = this.queue.then(() => {
      if (this.failed) throw new DataError('資料寫入結果無法確認，請重新開啟 App；不會覆蓋原資料');
      return operation();
    });
    this.queue = result.catch(() => {});
    return result;
  }

  canEncrypt() {
    return this.encryption.isEncryptionAvailable() && (process.platform !== 'linux' || this.encryption.getSelectedStorageBackend?.() !== 'basic_text');
  }

  async decode(document) {
    if (document?.schemaVersion !== 1 || !Number.isSafeInteger(document.revision) || document.revision < 1 || !document.migration || typeof document.migration.sourceHash !== 'string' || !Array.isArray(document.migration.keys) || document.migration.keys.some((key) => !keys.includes(key))) throw new DataError('App 資料檔格式或版本異常，未進行覆寫');
    const discord = document.discord;
    if (!Array.isArray(discord?.destinations)) throw new DataError('Discord 資料格式異常');
    const destinations = await Promise.all(discord.destinations.map(async (destination) => {
      if (!this.canEncrypt()) throw new DataError('系統加密目前無法使用，無法讀取 Webhook；原資料已保留');
      if (typeof destination.encryptedWebhook !== 'string' || !destination.encryptedWebhook || Object.hasOwn(destination, 'webhookUrl')) throw new DataError('Webhook 加密資料格式異常');
      let webhookUrl;
      try { webhookUrl = await this.encryption.decryptString(Buffer.from(destination.encryptedWebhook, 'base64')); }
      catch { throw new DataError('無法解密 Webhook，請使用原 Windows 帳號開啟；原資料已保留'); }
      return { id: destination.id, label: destination.label, webhookUrl };
    }));
    return { schemaVersion: 1, revision: document.revision, stats: validateStats(document.stats), preferences: checkPreferences(document.preferences), discord: normalizeDiscordSettings({ ...discord, destinations }), migration: document.migration };
  }

  async encode(state) {
    const destinations = await Promise.all(state.discord.destinations.map(async (destination) => {
      if (!this.canEncrypt()) throw new DataError('系統加密目前無法使用，未儲存 Webhook');
      let encrypted;
      try { encrypted = await this.encryption.encryptString(destination.webhookUrl); }
      catch { throw new DataError('Webhook 加密失敗，未變更設定'); }
      return { id: destination.id, label: destination.label, encryptedWebhook: encrypted.toString('base64') };
    }));
    return { ...state, discord: { ...state.discord, destinations } };
  }

  async persist(next) {
    const encoded = JSON.stringify(await this.encode(next), null, 2);
    const temporary = path.join(this.directory, `.application-${randomUUID()}.tmp`);
    let renamed = false;
    try {
      await this.io.mkdir(this.directory, { recursive: true });
      const handle = await this.io.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(encoded, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      // The old file and its ciphertext-only backup remain usable if replacing fails.
      try { await this.io.copyFile(this.file, `${this.file}.bak`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await this.io.rename(temporary, this.file); renamed = true;
      const checked = await this.io.readFile(this.file, 'utf8');
      if (checked !== encoded) throw new Error('Read-back mismatch');
      const decoded = await this.decode(JSON.parse(checked));
      if (JSON.stringify(decoded) !== JSON.stringify(next)) throw new Error('Verification mismatch');
      this.state = decoded;
    } catch (error) {
      if (renamed) this.failed = true;
      if (error instanceof DataError) throw error;
      throw new DataError(renamed ? '資料寫入結果無法確認，請重新開啟 App；舊資料尚未清除' : '無法寫入 AppData 資料檔，原資料未變更');
    } finally { await this.io.unlink(temporary).catch(() => {}); }
  }

  publicData() {
    if (this.failed) throw new DataError('資料寫入結果無法確認，請重新開啟 App；不會覆蓋原資料');
    if (!this.state) throw new DataError('App 資料尚未初始化');
    return {
      revision: this.state.revision,
      stats: structuredClone(this.state.stats), preferences: { ...this.state.preferences },
      discord: { ...this.state.discord, destinations: this.state.discord.destinations.map(({ id, label }) => ({ id, label })) },
      info: { directory: this.directory, encryptedWebhook: true, encryptionAvailable: this.canEncrypt() }
    };
  }

  initialize(legacy = {}) {
    return this.serialize(async () => {
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy) || Object.keys(legacy).some((key) => !keys.includes(key)) || keys.some((key) => legacy[key] != null && (typeof legacy[key] !== 'string' || Buffer.byteLength(legacy[key]) > 5 * 1024 * 1024))) throw new DataError('舊資料格式錯誤，未進行移轉');
      if (!this.state) {
        let text;
        try { text = await this.io.readFile(this.file, 'utf8'); }
        catch (error) { if (error.code !== 'ENOENT') throw new DataError('無法讀取 AppData 資料檔，原資料已保留'); }
        if (text !== undefined) {
          try { this.state = await this.decode(JSON.parse(text)); }
          catch (error) { throw error instanceof DataError ? error : new DataError('App 資料檔損壞，未覆寫；可從同目錄的 .bak 備份復原'); }
        } else {
          try {
            await this.io.stat(`${this.file}.bak`);
            throw new DataError('主要資料檔遺失，但備份仍存在；請先從 .bak 復原，未建立空白資料');
          } catch (error) { if (error instanceof DataError) throw error; if (error.code !== 'ENOENT') throw new DataError('無法確認 AppData 備份，未建立新資料'); }
          let stats, discord;
          try {
            stats = validateStats(JSON.parse(legacy.lolDrawStats || '{}'));
            discord = legacy.lolDiscordSync ? normalizeDiscordSettings(JSON.parse(legacy.lolDiscordSync)) : emptyDiscord();
          } catch { throw new DataError('舊統計或 Discord 資料格式異常，原資料已保留，未進行移轉'); }
          const theme = legacy.lolTheme || legacy['lol-theme'] || null;
          if (legacy.lolAutoApplyRoles != null && !['true', 'false'].includes(legacy.lolAutoApplyRoles)) throw new DataError('舊客戶端設定格式異常，未進行移轉');
          const migratedKeys = keys.filter((key) => legacy[key] != null);
          const next = { schemaVersion: 1, revision: 1, stats, preferences: checkPreferences({ theme, autoApplyRoles: legacy.lolAutoApplyRoles === 'true', drawMode: 'random' }), discord, migration: { sourceHash: legacyHash(legacy), keys: migratedKeys, valueHashes: Object.fromEntries(migratedKeys.map((key) => [key, valueHash(legacy[key])])) } };
          await this.persist(next);
        }
      }
      const hasLegacy = keys.some((key) => legacy[key] != null);
      const matches = this.state.migration.sourceHash === legacyHash(legacy);
      const cleanupKeys = this.state.migration.keys.filter((key) => legacy[key] != null && (matches || this.state.migration.valueHashes?.[key] === valueHash(legacy[key])));
      const changed = keys.some((key) => legacy[key] != null && !cleanupKeys.includes(key));
      return { data: this.publicData(), cleanupKeys, notice: hasLegacy ? changed ? 'AppData 資料已載入；偵測到不同的舊資料，已保留且未覆蓋。' : '舊資料已移轉並驗證完成。' : '' };
    });
  }

  update(change) {
    return this.serialize(async () => {
      this.publicData();
      const next = change(structuredClone(this.state));
      next.revision = this.state.revision + 1;
      await this.persist(next);
      return this.publicData();
    });
  }

  saveStats(stats) {
    return this.update((state) => ({ ...state, stats: validateStats(stats) }));
  }

  savePreferences(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new DataError('App 偏好設定格式錯誤');
    return this.update((state) => ({ ...state, preferences: checkPreferences({ ...state.preferences, ...patch }) }));
  }

  changeDiscord(action, payload) {
    return this.update((state) => {
      let discord = state.discord;
      if (action === 'configure') {
        if (!payload || typeof payload.label !== 'string' || (payload.webhookUrl != null && (typeof payload.webhookUrl !== 'string' || payload.webhookUrl.length > 4096))) throw new DataError('Discord 設定格式錯誤');
        const previous = discord.destinations.find((item) => item.id === payload?.previousId);
        discord = upsertDiscordDestination(discord, { ...payload, webhookUrl: payload?.webhookUrl?.trim() || previous?.webhookUrl || '' });
      } else if (action === 'select') discord = selectDiscordDestination(discord, payload);
      else if (action === 'remove') discord = removeDiscordDestination(discord, payload);
      else if (action === 'toggle') discord = { ...discord, enabled: !discord.enabled };
      else if (action === 'clear') discord = emptyDiscord();
      else throw new DataError('不支援的 Discord 設定操作');
      return { ...state, discord: normalizeDiscordSettings(discord) };
    });
  }

  importStats(text, mode) {
    const incoming = parseStatsBackup(text);
    return this.update((state) => ({ ...state, stats: importStats(state.stats, incoming, mode) }));
  }

  exportStats() { this.publicData(); return createStatsBackup(this.state.stats); }

  async sendDraw(results) {
    await this.queue;
    this.publicData();
    const discord = structuredClone(this.state.discord);
    const destination = getActiveDiscordDestination(discord);
    if (!discord.enabled || !destination) return null;
    return this.send(destination.webhookUrl, results);
  }
}
