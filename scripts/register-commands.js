require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { commandDefinitions } = require('../src/commands');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error('請確認 DISCORD_TOKEN、CLIENT_ID、GUILD_ID 都已在 .env 設定');
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commandDefinitions.map((c) => c.toJSON())
  });
  console.log('Guild 指令已註冊完成');
})();
