require('dotenv').config();

const { Client, Events, GatewayIntentBits } = require('discord.js');
const { createDatabase } = require('./db/sqlite');
const { PoolRepository } = require('./repositories/poolRepository');
const { StatsRepository } = require('./repositories/statsRepository');
const { handleCommand } = require('./commands');

const token = process.env.DISCORD_TOKEN;
const dbPath = process.env.DB_PATH || './data/bot.sqlite';

if (!token) {
  throw new Error('缺少 DISCORD_TOKEN，請先設定 .env');
}

const db = createDatabase(dbPath);
const repos = {
  pool: new PoolRepository(db),
  stats: new StatsRepository(db)
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot 已上線：${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleCommand(interaction, repos);
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      const payload = { content: '發生未預期錯誤，請稍後再試。' };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }
});

client.login(token);
