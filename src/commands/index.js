const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const { drawAssignments } = require('../domain/draw');
const { mergeCandidateNames } = require('../domain/poolMerge');

const MAX_POOL_SIZE = 5;
const REMOVE_PICKER_PAGE_SIZE = 25;
const UI_CUSTOM_ID = {
  draw: 'pool_ui:draw',
  fromVoice: 'pool_ui:from_voice',
  pickAddOpen: 'pool_ui:pick_add_open',
  pickAddSubmit: 'pool_ui:pick_add_submit',
  pickRemoveOpen: 'pool_ui:pick_remove_open',
  pickRemoveSubmit: 'pool_ui:pick_remove_submit',
  removePagePrev: 'pool_ui:remove_page_prev',
  removePageNext: 'pool_ui:remove_page_next',
  showMain: 'pool_ui:show_main'
};

const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('pool')
    .setDescription('管理抽籤候選名單')
    .addSubcommand((sub) => sub.setName('ui').setDescription('開啟候選名單互動面板'))
    .addSubcommand((sub) => sub.setName('list').setDescription('顯示候選名單'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('清空候選名單（管理員）')),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('查看統計資料')
    .addStringOption((opt) => opt.setName('name').setDescription('玩家名稱（選填）')),

  new SlashCommandBuilder().setName('resetstats').setDescription('清空統計資料（管理員）')
];

function formatPool(pool) {
  if (pool.length === 0) return '目前候選名單為空。';
  return `目前候選名單（${pool.length}/${MAX_POOL_SIZE}）：\n${pool.map((p, idx) => `${idx + 1}. ${p}`).join('\n')}`;
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

function formatFromVoiceSummary({ added, duplicates, skippedFull, skippedBots }, pool, includePool = true) {
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

  if (includePool) {
    lines.push('');
    lines.push(formatPool(pool));
  }
  return lines.join('\n');
}

function formatAddSummary({ added, duplicates, skippedFull }, pool, includePool = true) {
  const lines = [];
  lines.push('成員加入完成。');

  if (added.length > 0) {
    lines.push(`已加入：${added.join('、')}`);
  }
  if (duplicates.length > 0) {
    lines.push(`已在名單：${duplicates.join('、')}`);
  }
  if (skippedFull.length > 0) {
    lines.push(`超出上限未加入：${skippedFull.join('、')}`);
  }
  if (added.length === 0 && duplicates.length === 0 && skippedFull.length === 0) {
    lines.push('沒有可加入的名稱。');
  }

  if (includePool) {
    lines.push('');
    lines.push(formatPool(pool));
  }
  return lines.join('\n');
}

function formatRemoveSummary({ removed, notFound }, pool, includePool = true) {
  const lines = [];
  lines.push('名單移除完成。');

  if (removed.length > 0) {
    lines.push(`已移除：${removed.join('、')}`);
  }
  if (notFound.length > 0) {
    lines.push(`名單中找不到：${notFound.join('、')}`);
  }
  if (removed.length === 0 && notFound.length === 0) {
    lines.push('沒有可移除的名稱。');
  }

  if (includePool) {
    lines.push('');
    lines.push(formatPool(pool));
  }
  return lines.join('\n');
}

function createPoolUiComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(UI_CUSTOM_ID.draw).setLabel('抽籤').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(UI_CUSTOM_ID.pickAddOpen).setLabel('選擇加入').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(UI_CUSTOM_ID.pickRemoveOpen).setLabel('選擇刪除').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(UI_CUSTOM_ID.fromVoice).setLabel('匯入語音').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function formatPoolUiMessage(pool, statusMessage = '') {
  const lines = ['候選名單互動面板', '可用按鈕快速操作：抽籤 / 選擇加入 / 選擇刪除 / 匯入語音。'];
  if (statusMessage) {
    lines.push('');
    lines.push(statusMessage);
  }
  lines.push('');
  lines.push(formatPool(pool));
  return lines.join('\n');
}

function buildMainPanelPayload(pool, statusMessage = '') {
  return {
    content: formatPoolUiMessage(pool, statusMessage),
    components: createPoolUiComponents()
  };
}

function buildAddPickerComponents(currentPoolSize) {
  const maxValues = Math.min(25, Math.max(1, 50 - currentPoolSize));
  return {
    content: '請選擇要加入候選名單的成員：',
    components: [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(UI_CUSTOM_ID.pickAddSubmit)
          .setPlaceholder('選擇要加入候選名單的伺服器成員')
          .setMinValues(1)
          .setMaxValues(maxValues)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(UI_CUSTOM_ID.showMain).setLabel('返回主面板').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function createBackToMainComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(UI_CUSTOM_ID.showMain).setLabel('返回主面板').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function parsePageFromCustomId(customId, fallbackPage = 0) {
  const raw = String(customId || '').split(':')[2];
  const page = Number.parseInt(raw, 10);
  if (!Number.isInteger(page) || page < 0) return fallbackPage;
  return page;
}

function buildRemovePickerPayload(pool, page = 0) {
  if (pool.length === 0) {
    return {
      content: '目前候選名單為空，沒有可刪除項目。',
      components: createBackToMainComponents()
    };
  }

  const totalPages = Math.ceil(pool.length / REMOVE_PICKER_PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * REMOVE_PICKER_PAGE_SIZE;
  const pageItems = pool.slice(start, start + REMOVE_PICKER_PAGE_SIZE);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${UI_CUSTOM_ID.pickRemoveSubmit}:${safePage}`)
    .setPlaceholder('選擇要移除的候選玩家（可多選）')
    .setMinValues(1)
    .setMaxValues(pageItems.length)
    .addOptions(pageItems.map((name) => ({ label: name, value: name })));

  const rows = [new ActionRowBuilder().addComponents(select)];

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${UI_CUSTOM_ID.removePagePrev}:${safePage}`)
          .setLabel('上一頁')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId(`${UI_CUSTOM_ID.removePageNext}:${safePage}`)
          .setLabel('下一頁')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1)
      )
    );
  }

  rows.push(...createBackToMainComponents());

  return {
    content: `選擇要移除的候選玩家（第 ${safePage + 1}/${totalPages} 頁）`,
    components: rows
  };
}

function mergeIntoPool(repos, guildId, candidateNames, maxSize = MAX_POOL_SIZE) {
  const currentPool = repos.pool.getPool(guildId);
  const merged = mergeCandidateNames(currentPool, candidateNames, maxSize);

  if (merged.added.length > 0) {
    repos.pool.setPool(guildId, merged.nextPool);
    for (const name of merged.added) {
      repos.stats.upsertPlayer(guildId, name);
    }
  }

  return merged;
}

function removeFromPool(repos, guildId, candidateNames) {
  const removed = [];
  const notFound = [];
  const uniqueNames = Array.from(new Set(candidateNames));

  for (const name of uniqueNames) {
    const result = repos.pool.remove(guildId, name);
    if (result.ok) {
      removed.push(name);
      continue;
    }
    notFound.push(name);
  }

  return {
    removed,
    notFound,
    pool: repos.pool.getPool(guildId)
  };
}

async function addUsersToPool(interaction, repos, userIds) {
  const names = [];
  const seen = new Set();

  for (const userId of userIds) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const user = member?.user || interaction.client.users.cache.get(userId) || null;
    if (!user || user.bot) continue;

    const name = String(member?.displayName || user.globalName || user.username || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return mergeIntoPool(repos, interaction.guildId, names);
}

async function importFromVoice(interaction, repos) {
  if (!interaction.inGuild()) {
    return { ok: false, message: '此功能只能在伺服器中使用。', uiMessage: '此功能只能在伺服器中使用。' };
  }

  const requester = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const channel = requester?.voice?.channel;
  if (!channel) {
    return {
      ok: false,
      message: '你目前不在任何語音頻道，請先進入語音頻道後再使用。',
      uiMessage: '你目前不在任何語音頻道，請先進入語音頻道後再使用。'
    };
  }

  const voiceMembers = Array.from(channel.members.values());
  const skippedBots = voiceMembers.filter((m) => m.user.bot).map((m) => m.displayName);
  const candidateNames = voiceMembers
    .filter((m) => !m.user.bot)
    .map((m) => m.displayName);

  if (candidateNames.length === 0) {
    return {
      ok: false,
      message: '目前語音頻道沒有可加入的真人成員。',
      uiMessage: '目前語音頻道沒有可加入的真人成員。'
    };
  }

  // from-voice 允許先匯入超過 5 人，抽籤前再提示需縮減名單
  const merged = mergeIntoPool(repos, interaction.guildId, candidateNames, Number.POSITIVE_INFINITY);
  return {
    ok: true,
    pool: merged.nextPool,
    message: formatFromVoiceSummary(
      {
        added: merged.added,
        duplicates: merged.duplicates,
        skippedFull: merged.skippedFull,
        skippedBots
      },
      merged.nextPool
    ),
    uiMessage: formatFromVoiceSummary(
      {
        added: merged.added,
        duplicates: merged.duplicates,
        skippedFull: merged.skippedFull,
        skippedBots
      },
      merged.nextPool,
      false
    )
  };
}

function executeDraw(guildId, repos) {
  const pool = repos.pool.getPool(guildId);
  if (pool.length > MAX_POOL_SIZE) {
    const extraCount = pool.length - MAX_POOL_SIZE;
    return {
      ok: false,
      message: `目前候選名單共 ${pool.length} 人，超過上限 ${MAX_POOL_SIZE} 人，請先刪除 ${extraCount} 人後再抽籤。`,
      pool
    };
  }

  try {
    const results = drawAssignments(pool);
    repos.stats.applyDraw(guildId, results);
    return { ok: true, message: `抽籤完成：\n${formatDrawResult(results)}`, pool };
  } catch (error) {
    return { ok: false, message: `抽籤失敗：${error.message}`, pool };
  }
}

async function handlePoolCommand(interaction, repos) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'ui') {
    const pool = repos.pool.getPool(guildId);
    return interaction.reply({ ...buildMainPanelPayload(pool), ephemeral: true });
  }

  if (subcommand === 'list') {
    return interaction.reply(formatPool(repos.pool.getPool(guildId)));
  }

  if (subcommand === 'clear') {
    if (!isManager(interaction)) return interaction.reply('需要伺服器管理員權限才能清空名單。');
    repos.pool.clear(guildId);
    return interaction.reply('已清空候選名單。');
  }

  return interaction.reply('未知的子指令。');
}

async function handlePoolUiButton(interaction, repos) {
  if (!interaction.customId.startsWith('pool_ui:')) return;

  if (interaction.customId === UI_CUSTOM_ID.draw) {
    const result = executeDraw(interaction.guildId, repos);
    const pool = repos.pool.getPool(interaction.guildId);

    if (result.ok) {
      if (interaction.channel) {
        await interaction.channel.send(result.message);
        return interaction.update(buildMainPanelPayload(pool, '抽籤結果已發佈到頻道。'));
      }
      return interaction.update(buildMainPanelPayload(pool, '抽籤完成，但無法發佈到目前頻道。'));
    }

    return interaction.update(buildMainPanelPayload(pool, result.message));
  }

  if (interaction.customId === UI_CUSTOM_ID.pickAddOpen) {
    const pool = repos.pool.getPool(interaction.guildId);
    return interaction.update(buildAddPickerComponents(pool.length));
  }

  if (interaction.customId === UI_CUSTOM_ID.pickRemoveOpen) {
    const pool = repos.pool.getPool(interaction.guildId);
    const payload = buildRemovePickerPayload(pool, 0);
    return interaction.update(payload);
  }

  if (interaction.customId === UI_CUSTOM_ID.showMain) {
    const pool = repos.pool.getPool(interaction.guildId);
    return interaction.update(buildMainPanelPayload(pool));
  }

  if (interaction.customId.startsWith(`${UI_CUSTOM_ID.removePagePrev}:`)) {
    const currentPage = parsePageFromCustomId(interaction.customId, 0);
    const pool = repos.pool.getPool(interaction.guildId);
    const payload = buildRemovePickerPayload(pool, Math.max(0, currentPage - 1));
    return interaction.update(payload);
  }

  if (interaction.customId.startsWith(`${UI_CUSTOM_ID.removePageNext}:`)) {
    const currentPage = parsePageFromCustomId(interaction.customId, 0);
    const pool = repos.pool.getPool(interaction.guildId);
    const payload = buildRemovePickerPayload(pool, currentPage + 1);
    return interaction.update(payload);
  }

  if (interaction.customId === UI_CUSTOM_ID.fromVoice) {
    const result = await importFromVoice(interaction, repos);
    const pool = result.pool || repos.pool.getPool(interaction.guildId);
    return interaction.update(buildMainPanelPayload(pool, result.uiMessage || result.message));
  }
}

async function handlePoolUiUserSelect(interaction, repos) {
  if (interaction.customId !== UI_CUSTOM_ID.pickAddSubmit) return;
  if (!interaction.inGuild()) {
    const pool = repos.pool.getPool(interaction.guildId);
    return interaction.update(buildMainPanelPayload(pool, '此功能只能在伺服器中使用。'));
  }

  const merged = await addUsersToPool(interaction, repos, interaction.values || []);
  return interaction.update(
    buildMainPanelPayload(
      merged.nextPool,
      formatAddSummary(
        {
          added: merged.added,
          duplicates: merged.duplicates,
          skippedFull: merged.skippedFull
        },
        merged.nextPool,
        false
      )
    )
  );
}

async function handlePoolUiStringSelect(interaction, repos) {
  if (!interaction.customId.startsWith(`${UI_CUSTOM_ID.pickRemoveSubmit}:`)) return;

  const result = removeFromPool(repos, interaction.guildId, interaction.values || []);
  return interaction.update(
    buildMainPanelPayload(
      result.pool,
      formatRemoveSummary(
        {
          removed: result.removed,
          notFound: result.notFound
        },
        result.pool,
        false
      )
    )
  );
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
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'pool') {
      return handlePoolCommand(interaction, repos);
    }

    if (interaction.commandName === 'stats') {
      return handleStatsCommand(interaction, repos);
    }

    if (interaction.commandName === 'resetstats') {
      return handleResetStats(interaction, repos);
    }

    return interaction.reply('未知指令。');
  }

  if (interaction.isButton()) {
    return handlePoolUiButton(interaction, repos);
  }

  if (interaction.isUserSelectMenu()) {
    return handlePoolUiUserSelect(interaction, repos);
  }

  if (interaction.isStringSelectMenu()) {
    return handlePoolUiStringSelect(interaction, repos);
  }
}

module.exports = {
  commandDefinitions,
  handleCommand
};
