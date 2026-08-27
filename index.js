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
  ButtonBuilder,
  ButtonStyle,
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
  return value.trim();
}

async function keyAuthRequest(params) {
  const url = new URL("https://keyauth.win/api/1.3/");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "NEXORIAN.CC/1.0" },
      signal: controller.signal
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`KeyAuth returned non-JSON response (HTTP ${response.status}).`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyKeyAuthLicense(key, discordUserId) {
  const name = process.env.KEYAUTH_APP_NAME || process.env.KEYAUTH_NAME;
  const ownerid = process.env.KEYAUTH_OWNER_ID || process.env.KEYAUTH_OWNERID;
  const ver = process.env.KEYAUTH_APP_VERSION || process.env.KEYAUTH_VERSION || "1.0";

  if (!name || !ownerid) {
    throw new Error("KEYAUTH_APP_NAME and KEYAUTH_OWNER_ID must be set in .env");
  }

  // KeyAuth's free Client API requires initialization before license authentication.
  const init = await keyAuthRequest({
    type: "init",
    ver,
    name,
    ownerid
  });

  if (!init.success || !init.sessionid) {
    throw new Error(init.message || "KeyAuth initialization failed.");
  }

  // License-only authentication consumes the license and creates/validates
  // the associated KeyAuth user, so the Discord user gets a one-time redemption.
  const username = `discord_${discordUserId}`;
  const password = crypto.randomBytes(24).toString("hex");

  const result = await keyAuthRequest({
    type: "register",
    username,
    pass: password,
    key,
    sessionid: init.sessionid,
    name,
    ownerid
  });

  return {
    ok: Boolean(result.success),
    message: result.message || "KeyAuth rejected the license.",
    info: result.info
  };
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
    .setName("setup-redeem")
    .setDescription("Post the NEXORIAN.CC license redemption panel in this channel.")
    .setDefaultMemberPermissions("8"),
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
    console.log("Registered /redeem-key, /setup-redeem, and /generate-key.");
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

    if (interaction.commandName === "setup-redeem") {
      const button = new ButtonBuilder()
        .setCustomId("redeem_key_button")
        .setLabel("Redeem Key")
        .setEmoji("🔑")
        .setStyle(ButtonStyle.Primary);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🔑 NEXORIAN.CC LICENSE")
        .setDescription("Get your buyer role by pressing **Redeem Key** below and entering your license key.")
        .setFooter({ text: "NEXORIAN.CC • License System" });

      await interaction.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)]
      });

      return interaction.reply({
        content: "✅ Redemption panel posted in this channel.",
        ephemeral: true
      });
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

  if (interaction.isButton() && interaction.customId === "redeem_key_button") {
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

  if (interaction.isModalSubmit() && interaction.customId === "redeem_key_modal") {
    await interaction.deferReply({ ephemeral: true });

    const key = normalizeKey(interaction.fields.getTextInputValue("license_key"));
    const licenses = loadLicenses();
    const license = licenses[key];

    if (license && license.redeemedBy.includes(interaction.user.id)) {
      return interaction.editReply("❌ You have already redeemed this key.");
    }

    let authResult;
    try {
      authResult = await verifyKeyAuthLicense(key, interaction.user.id);
    } catch (error) {
      console.error("KeyAuth verification failed:", error);
      return interaction.editReply("⚠️ KeyAuth verification is temporarily unavailable. Please try again.");
    }

    if (!authResult.ok) {
      return interaction.editReply("❌ KeyAuth rejected that license. Check that it is valid and unused.");
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

    const localLicense = license || {
      uses: 1,
      redeemed: 0,
      redeemedBy: []
    };

    localLicense.redeemed += 1;
    localLicense.redeemedBy.push(interaction.user.id);
    licenses[key] = localLicense;
    saveLicenses(licenses);

    const embed = new EmbedBuilder()
      .setTitle("✅ Key Redeemed")
      .setDescription(`Your license has been redeemed successfully. You received the **${role.name}** role.`)
      .setFooter({ text: "NEXORIAN.CC" });

    return interaction.editReply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
