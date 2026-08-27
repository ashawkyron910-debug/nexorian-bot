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

function authenticateKeyAuthShop(key, hwid) {
  return new Promise((resolve, reject) => {
    const projectId = process.env.KEYAUTH_PROJECT || process.env.KEYAUTH_PROJECT_ID;
    if (!projectId) return reject(new Error("KEYAUTH_PROJECT is missing."));

    const tls = require("tls");
    const socket = tls.connect({
      host: "socket.keyauth.shop",
      port: 3389,
      rejectUnauthorized: true,
      servername: "socket.keyauth.shop"
    });

    let buffer = "";
    let stage = "handshake";
    let timer;

    const finish = (result) => {
      clearTimeout(timer);
      try { socket.end(); } catch {}
      resolve(result);
    };

    const fail = (error) => {
      clearTimeout(timer);
      try { socket.destroy(); } catch {}
      reject(error);
    };

    timer = setTimeout(() => fail(new Error("KeyAuth Shop request timed out.")), 15000);

    socket.once("error", fail);

    socket.on("secureConnect", () => {
      socket.write("2");
      setTimeout(() => {
        if (stage !== "handshake") return;
        socket.write([projectId, key, hwid].join("|"));
        stage = "auth";
      }, 200);
    });

    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");

      if (buffer.includes("CHALLENGE|")) {
        const line = buffer.split(/\r?\n/).find(x => x.startsWith("CHALLENGE|")) || buffer;
        const parts = line.split("|");
        if (parts.length >= 3) {
          const id = parts[1];
          const nonce = parts[2];
          const signature = crypto.createHmac("sha256", key).update(nonce).digest("hex");
          socket.write(["RESPONSE", id, signature].join("|"));
          buffer = "";
        }
        return;
      }

      if (buffer.includes("ACCESS|")) {
        finish({ ok: true, raw: buffer });
        return;
      }

      const lower = buffer.toLowerCase();
      if (
        lower.includes("invalid") ||
        lower.includes("expired") ||
        lower.includes("banned") ||
        lower.includes("denied") ||
        lower.includes("error")
      ) {
        finish({ ok: false, raw: buffer });
      }
    });
  });
}

function normalizeKey(value) {
  return value.trim();
}

function authenticateKeyAuthShop(key, hwid) {
  return new Promise((resolve, reject) => {
    const projectId = process.env.KEYAUTH_PROJECT || process.env.KEYAUTH_PROJECT_ID;
    if (!projectId) return reject(new Error("KEYAUTH_PROJECT is missing."));

    const tls = require("tls");
    const socket = tls.connect({
      host: "socket.keyauth.shop",
      port: 3389,
      rejectUnauthorized: true,
      servername: "socket.keyauth.shop"
    });

    let buffer = "";
    let stage = "handshake";
    let timer;

    const finish = (result) => {
      clearTimeout(timer);
      try { socket.end(); } catch {}
      resolve(result);
    };

    const fail = (error) => {
      clearTimeout(timer);
      try { socket.destroy(); } catch {}
      reject(error);
    };

    timer = setTimeout(() => fail(new Error("KeyAuth Shop request timed out.")), 15000);

    socket.once("error", fail);

    socket.on("secureConnect", () => {
      socket.write("2");
      setTimeout(() => {
        if (stage !== "handshake") return;
        socket.write([projectId, key, hwid].join("|"));
        stage = "auth";
      }, 200);
    });

    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");

      if (buffer.includes("CHALLENGE|")) {
        const line = buffer.split(/\r?\n/).find(x => x.startsWith("CHALLENGE|")) || buffer;
        const parts = line.split("|");
        if (parts.length >= 3) {
          const id = parts[1];
          const nonce = parts[2];
          const signature = crypto.createHmac("sha256", key).update(nonce).digest("hex");
          socket.write(["RESPONSE", id, signature].join("|"));
          buffer = "";
        }
        return;
      }

      if (buffer.includes("ACCESS|")) {
        finish({ ok: true, raw: buffer });
        return;
      }

      const lower = buffer.toLowerCase();
      if (
        lower.includes("invalid") ||
        lower.includes("expired") ||
        lower.includes("banned") ||
        lower.includes("denied") ||
        lower.includes("error")
      ) {
        finish({ ok: false, raw: buffer });
      }
    });
  });
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
      authResult = await authenticateKeyAuthShop(key, interaction.user.id);
    } catch (error) {
      console.error("KeyAuth Shop verification failed:", error);
      return interaction.editReply("⚠️ KeyAuth verification is temporarily unavailable. Please try again.");
    }

    if (!authResult.ok) {
      return interaction.editReply("❌ That KeyAuth Shop license is invalid, expired, or denied.");
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
