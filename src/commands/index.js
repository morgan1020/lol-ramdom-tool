const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { drawAssignments } = require('../domain/draw');
const { mergeCandidateNames } = require('../domain/poolMerge');

const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('pool')
    .setDescription('管理抽籤候選名單')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('加入玩家到抽籤候選名單')
        .addStringOption((opt) => opt.setName('name').setDescription('玩家名稱（選填）'))
        .addUserOption((opt) => opt.setName('member').setDescription('伺服器成員（選填）'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('從候選名單移除玩家')
        .addStringOption((opt) => opt.setName('name').setDescription('玩家名稱').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('顯示候選名單'))
    .addSubcommand((sub) => sub.setName('from-voice').setDescription('從你目前所在語音頻道加入成員'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('清空候選名單（管理員）')),

  new SlashCommandBuilder().setName('draw').setDescription('根據候選名單執行抽籤'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('查看統計資料')
    .addStringOption((opt) => opt.setName('name').setDescription('玩家名稱（選填）')),

  new SlashCommandBuilder().setName('resetstats').setDescription('清空統計資料（管理員）')
];

function formatPool(pool) {
  if (pool.length === 0) return '目前候選名單為空。';
  return `目前候選名單（${pool.length}/5）：\n${pool.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}`;
}

function formatDrawResult(results) {
  return results
    .map((r) => `${r.name}：主要 ${r.main}｜次要 ${r.secondary || '-'}`)
    .join('\n');
}

function formatStatsRows(rows) {
  if (rows.length === 0) return '目前沒有統計資料。';
  return rows
    .map((row) => {
      const total = row.top + row.jungle + row.mid + row.adc + row.support;
      return `${row.name}｜上:${row.top} 野:${row.jungle} 中:${row.mid} 下:${row.adc} 輔:${row.support}｜總分:${total}`;
    })
    .join('\n');
}

function isManager(interaction) {
  if (!interaction.inGuild()) return false;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
}

function formatFromVoiceSummary({ added, duplicates, skippedFull, skippedBots }, pool) {
  const lines = [];
  lines.push('語音頻道成員匯入完成。');

  if (added.length > 0) {
    lines.push(`已加入：${added.join('、')}`);
  }
  if (duplicates.length > 0) {
    lines.push(`已在名單：${duplicates.join('、')}`);
  }
  if (skippedFull.length > 0) {
    lines.push(`超出上限未加入：${skippedFull.join('、')}`);
  }
  if (skippedBots.length > 0) {
    lines.push(`略過機器人：${skippedBots.join('、')}`);
  }

  lines.push('');
  lines.push(formatPool(pool));
  return lines.join('\n');
}

async function resolveAddName(interaction) {
  const user = interaction.options.getUser('member');
  if (user) {
    if (user.bot) {
      return { error: '候選名單不支援加入機器人帳號。' };
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const displayName = member?.displayName || user.globalName || user.username;
    return { name: String(displayName || '').trim() };
  }

  const raw = interaction.options.getString('name');
  const name = String(raw || '').trim();
  if (!name) {
    return { error: '請提供 `name` 或 `member` 其中一個。' };
  }

  return { name };
}

async function handlePoolCommand(interaction, repos) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const resolved = await resolveAddName(interaction);
    if (resolved.error) return interaction.reply(resolved.error);
    const name = resolved.name;
    if (!name) return interaction.reply('請提供有效的玩家名稱。');

    repos.stats.upsertPlayer(guildId, name);
    const result = repos.pool.add(guildId, name);
    if (!result.ok && result.reason === 'duplicate') return interaction.reply('玩家已在候選名單中。');
    if (!result.ok && result.reason === 'full') return interaction.reply('抽籤人數已滿 5 人。');
    return interaction.reply(`已加入 ${name}。\n${formatPool(result.pool)}`);
  }

  if (subcommand === 'remove') {
    const name = interaction.options.getString('name', true).trim();
    const result = repos.pool.remove(guildId, name);
    if (!result.ok) return interaction.reply('找不到該玩家。');
    return interaction.reply(`已移除 ${name}。\n${formatPool(result.pool)}`);
  }

  if (subcommand === 'list') {
    return interaction.reply(formatPool(repos.pool.getPool(guildId)));
  }

  if (subcommand === 'from-voice') {
    if (!interaction.inGuild()) return interaction.reply('此指令只能在伺服器中使用。');

    const requester = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const channel = requester?.voice?.channel;
    if (!channel) {
      return interaction.reply('你目前不在任何語音頻道，請先進入語音頻道後再使用。');
    }

    const voiceMembers = Array.from(channel.members.values());
    const skippedBots = voiceMembers.filter((m) => m.user.bot).map((m) => m.displayName);
    const candidateNames = voiceMembers
      .filter((m) => !m.user.bot)
      .map((m) => m.displayName);

    if (candidateNames.length === 0) {
      return interaction.reply('目前語音頻道沒有可加入的真人成員。');
    }

    const currentPool = repos.pool.getPool(guildId);
    const merged = mergeCandidateNames(currentPool, candidateNames, 5);

    if (merged.added.length > 0) {
      repos.pool.setPool(guildId, merged.nextPool);
      for (const name of merged.added) {
        repos.stats.upsertPlayer(guildId, name);
      }
    }

    return interaction.reply(
      formatFromVoiceSummary(
        {
          added: merged.added,
          duplicates: merged.duplicates,
          skippedFull: merged.skippedFull,
          skippedBots
        },
        merged.nextPool
      )
    );
  }

  if (subcommand === 'clear') {
    if (!isManager(interaction)) return interaction.reply('需要伺服器管理員權限才能清空名單。');
    repos.pool.clear(guildId);
    return interaction.reply('已清空候選名單。');
  }

  return interaction.reply('未知的子指令。');
}

async function handleDrawCommand(interaction, repos) {
  const guildId = interaction.guildId;
  const pool = repos.pool.getPool(guildId);

  try {
    const results = drawAssignments(pool);
    repos.stats.applyDraw(guildId, results);
    return interaction.reply(`抽籤完成：\n${formatDrawResult(results)}`);
  } catch (error) {
    return interaction.reply(`抽籤失敗：${error.message}`);
  }
}

async function handleStatsCommand(interaction, repos) {
  const guildId = interaction.guildId;
  const name = interaction.options.getString('name');
  const rows = repos.stats.getStats(guildId, name || undefined);
  return interaction.reply(formatStatsRows(rows));
}

async function handleResetStats(interaction, repos) {
  if (!isManager(interaction)) {
    return interaction.reply('需要伺服器管理員權限才能清空統計。');
  }

  repos.stats.reset(interaction.guildId);
  return interaction.reply('已清空統計資料。');
}

async function handleCommand(interaction, repos) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'pool') {
    return handlePoolCommand(interaction, repos);
  }

  if (interaction.commandName === 'draw') {
    return handleDrawCommand(interaction, repos);
  }

  if (interaction.commandName === 'stats') {
    return handleStatsCommand(interaction, repos);
  }

  if (interaction.commandName === 'resetstats') {
    return handleResetStats(interaction, repos);
  }

  return interaction.reply('未知指令。');
}

module.exports = {
  commandDefinitions,
  handleCommand
};
