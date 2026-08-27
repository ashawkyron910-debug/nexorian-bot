require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require("discord.js");

const LICENSE_FILE = "./licenses.json";

function loadLicenses() {
  if (!fs.existsSync(LICENSE_FILE)) fs.writeFileSync(LICENSE_FILE, "{}");
  return JSON.parse(fs.readFileSync(LICENSE_FILE, "utf8"));
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
}

function normalizeKey(value) {
  return value.trim().toUpperCase();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const commands = [
  new SlashCommandBuilder()
    .setName("redeem-key")
    .setDescription("Redeem a license key and receive the configured customer role."),
  new SlashCommandBuilder()
    .setName("generate-key")
    .setDescription("Generate a new license key.")
    .addIntegerOption(option =>
      option
        .setName("uses")
        .setDescription("How many times the key can be redeemed.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false)
    )
    .setDefaultMemberPermissions("8")
].map(command => command.toJSON());

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s).`);

  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn("GUILD_ID is missing. Slash commands were not registered.");
    return;
  }

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands }
    );
    console.log("Registered /redeem-key and /generate-key.");
  } catch (error) {
    console.error("Slash command registration failed:", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "redeem-key") {
      const modal = new ModalBuilder()
        .setCustomId("redeem_key_modal")
        .setTitle("Enter License Key");

      const keyInput = new TextInputBuilder()
        .setCustomId("license_key")
        .setLabel("License Key")
        .setPlaceholder("Enter your license key")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder().addComponents(keyInput)
      );

      return interaction.showModal(modal);
    }

    if (interaction.commandName === "generate-key") {
      const uses = interaction.options.getInteger("uses") || 1;
      const key = `NEX-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

      const licenses = loadLicenses();
      licenses[key] = {
        uses,
        redeemed: 0,
        redeemedBy: []
      };
      saveLicenses(licenses);

      return interaction.reply({
        content: `🔑 Generated key: \`${key}\`\\nUses: **${uses}**`,
        ephemeral: true
      });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "redeem_key_modal") {
    await interaction.deferReply({ ephemeral: true });

    const key = normalizeKey(interaction.fields.getTextInputValue("license_key"));
    const licenses = loadLicenses();
    const license = licenses[key];

    if (!license) {
      return interaction.editReply("❌ That license key is invalid.");
    }

    if (license.redeemed >= license.uses) {
      return interaction.editReply("❌ That license key has no uses remaining.");
    }

    if (license.redeemedBy.includes(interaction.user.id)) {
      return interaction.editReply("❌ You have already redeemed this key.");
    }

    const buyerRoleId = process.env.BUYER_ROLE_ID;
    if (!buyerRoleId) {
      return interaction.editReply("⚠️ BUYER_ROLE_ID is not configured.");
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const role = await interaction.guild.roles.fetch(buyerRoleId);

    if (!role) {
      return interaction.editReply("⚠️ The configured Buyer role could not be found.");
    }

    await member.roles.add(role);

    license.redeemed += 1;
    license.redeemedBy.push(interaction.user.id);
    saveLicenses(licenses);

    const embed = new EmbedBuilder()
      .setTitle("✅ Key Redeemed")
      .setDescription(`Your license has been redeemed successfully. You received the **${role.name}** role.`)
      .setFooter({ text: "NEXORIAN.CC" });

    return interaction.editReply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
