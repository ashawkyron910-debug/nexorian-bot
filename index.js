require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s).`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = process.env.PREFIX || "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "ping") {
    await message.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  if (command === "server") {
    await message.reply(
      `⚡ **${message.guild.name}**\nMembers: ${message.guild.memberCount}`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
