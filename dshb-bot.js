require("dotenv").config();
const cheerio = require("cheerio");
const { EmbedBuilder } = require("discord.js");
const axios = require("axios");
const {
  Client,
  Events,
  GatewayIntentBits,
  ApplicationCommandType,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const token = process.env.TOKEN;
const API_URL = "https://sqstat.ru/api/server/stat.php?server=C";
const MAX_PLAYERS = 100;

const commands = [
  {
    name: "🚀Повысить",
    type: ApplicationCommandType.User,
  },
  {
    name: "Понизить",
    type: ApplicationCommandType.User,
  },
  {
    name: "Забанить",
    type: ApplicationCommandType.User,
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Refreshing application (/) commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("Successfully registered application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();

const PREFIX = "!";
const promotionFilePath = path.join(__dirname, "promotionDates.json");

let promotionDates = {};
if (fs.existsSync(promotionFilePath)) {
  try {
    const fileData = fs.readFileSync(promotionFilePath, "utf-8");
    if (fileData.trim()) {
      promotionDates = JSON.parse(fileData);
    } else {
      console.log("promotionDates.json is empty, starting fresh.");
    }
  } catch (error) {
    console.error("Error reading or parsing promotionDates.json:", error);
  }
} else {
  console.log("promotionDates.json not found, creating a new one.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const CONFIG = {
  ADMIN_ROLES: ["1233420465499017319", "1204875226110885979"],
  ROLES: {
    СMD: "1254831503121059900",
    COMMANDER: "1186911102043435100",
    VICE_COMMANDER: "1233029491908149351",
    ELITE: "1186912762018926662",
    RANGER: "1186912800547811389",
    RECRUIT: "1227927464916025444",
    GUEST: "1204881159742423040",
  },
  CHANNELS: {
    BOT_CONTROL_LOG: "1318896486821658624",
    RECRUIT_CHAT: "1283840895208259634",
    ANNOUNCEMENTS: "1298239839556210808",
  },
};

const AUTHORIZED_ROLES = [
  ...CONFIG.ADMIN_ROLES,
  CONFIG.ROLES.CMD,
  CONFIG.ROLES.COMMANDER,
];

function hasRequiredRole(member) {
  return member.roles.cache.some((role) => AUTHORIZED_ROLES.includes(role.id));
}

const roleHierarchy = [
  ...CONFIG.ADMIN_ROLES,
  CONFIG.ROLES.CMD,
  CONFIG.ROLES.COMMANDER,
  CONFIG.ROLES.VICE_COMMANDER,
  CONFIG.ROLES.ELITE,
  CONFIG.ROLES.RANGER,
  CONFIG.ROLES.RECRUIT,
  CONFIG.ROLES.GUEST,
];

async function updateBotStatus() {
  try {
    const response = await axios.get(API_URL);
    const serverData = response.data;
    const queue = serverData.data.queue_players;
    const map = response.data.data.map;

    if (
      serverData.status === "ok" &&
      serverData.data &&
      serverData.data.players
    ) {
      const playerCount = serverData.data.players.length;
      client.user.setPresence({
        activities: [
          {
            name: `RU[AAS] - ${playerCount}/${MAX_PLAYERS} (+${queue}) ${map}`,
            type: 0,
          },
        ],
        status: "online",
      });
    } else {
      console.error("Failed to fetch player data or invalid response.");
    }
  } catch (error) {
    console.error("Error fetching server data:", error);
  }
}

function savePromotionDates() {
  fs.writeFileSync(
    promotionFilePath,
    JSON.stringify(promotionDates, null, 2),
    "utf-8"
  );
}

function getRoleIndex(roleId) {
  return roleHierarchy.indexOf(roleId);
}

function getHighestRole(member) {
  let highestRoleIndex = -1;
  let highestRoleId = null;

  member.roles.cache.forEach((role) => {
    const index = getRoleIndex(role.id);
    if (index !== -1 && (highestRoleIndex === -1 || index < highestRoleIndex)) {
      highestRoleIndex = index;
      highestRoleId = role.id;
    }
  });

  return { roleId: highestRoleId, index: highestRoleIndex };
}

async function sendMessageToChannel(channelId, messageContent) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }
    await channel.send(messageContent);
    console.log("Message sent successfully!");
  } catch (error) {
    console.error("Failed to send message:", error.message);
  }
}

function getPromotionDate(member) {
  const promotionDateStr = promotionDates[member.id];
  return promotionDateStr ? new Date(promotionDateStr) : null;
}

async function handlePromotion(
  message,
  targetMember,
  authorHighestRole,
  targetHighestRole,
  guild
) {
  try {
    if (!hasRequiredRole(message.member || message)) {
      return message.reply({
        content:
          "🚫 У вас нет прав для повышения игроков. Это могут делать только администраторы, КМД и командиры.",
        ephemeral: true,
      });
    }

    if (targetHighestRole.index <= authorHighestRole.index) {
      return message.reply(
        "🪖Вы не можете повысить пользователя, у которого такая же или более высокая роль."
      );
    }

    const currentRoleIndex = targetHighestRole.index;
    const newRoleIndex = currentRoleIndex - 1;
    const newRoleId = roleHierarchy[newRoleIndex];

    if (!newRoleId) {
      return message.reply("Невозможно повысить дальше.");
    }

    const newRole = guild.roles.cache.get(newRoleId);
    if (!newRole) {
      return message.reply("Роль для повышения не найдена.");
    }

    await targetMember.roles.add(newRoleId);
    await targetMember.roles.remove(targetHighestRole.roleId);

    if (newRoleId === CONFIG.ROLES.RECRUIT) {
      promotionDates[targetMember.id] = new Date().toISOString();
      savePromotionDates();

      const msg = `# 👋Игрок <@${targetMember.id}> теперь в рекрутах. Добро пожаловать!\n\n В течении двух недель у вас будет держаться роль рекрута после чего командиры решат повышать вас или продлить рекрута. Если вы не подходите нашему клану я вам напишу в личные сообщения.\n\n Вам доступна команда !рекрут (пропиши в чате) что-бы узнать сколько у вас осталось до получения роли Стрелок с тегом ДШБ в игре/ другим вердиктом командования. \n\n Выполняйте команды, штурмуйте и не нарушайте правила. ☝🏼За каждым нарушением следует наказание!\n Вы УЖЕ можете ставить приписку [DSHBr] в настройках в "префикс имени"\n\n Рекрутом можно быть только 2 недели, далее - либо повышение до Стрелка, либо: понижение до Гостя/исключение из сервера(при грубых нарушениях). \n\n По какому пути пойдете решать только вам! Командиры оценят вашу дисциплину, поведение и активность и через 2 недели будет вынесено решение. \n\n В случае получения 3-х замечаний вы автоматически "отлетаете" несмотря на период в две недели.\n\n Убедитесь в том, что:\n -Вы поменяли ник на сервере на ник в Steam.\n -Вы ознакомились и ВНИКЛИ в каждое правило ДШБ.\n -Вы соответствуете по возрасту.\n\n Удачи в бою!`;

      await sendMessageToChannel(
        "1320713497075781703",
        `<@${targetMember.id}> теперь с нами! Идём в бой!`
      );
      await targetMember.send(msg);
      await sendMessageToChannel(
        CONFIG.CHANNELS.BOT_CONTROL_LOG,
        `<@${message.author.id}> повысил <@${targetMember.id}> до роли ${newRole.name}`
      );
    } else {
      await sendMessageToChannel(
        CONFIG.CHANNELS.BOT_CONTROL_LOG,
        `<@${message.author.id}> повысил <@${targetMember.id}> до роли ${newRole.name}`
      );
      await sendMessageToChannel(
        "1320713497075781703",
        `# :saluting_face: <@${targetMember.id}> повышен до роли ${newRole.name}`
      );
    }

    return message.reply(`Успешно повышен до роли ${newRole.name}`);
  } catch (error) {
    console.error("Error in promotion handler:", error);
    throw error;
  }
}

async function handleDemotion(
  message,
  targetMember,
  authorHighestRole,
  targetHighestRole,
  guild
) {
  try {
    if (!hasRequiredRole(message.member || message)) {
      return message.reply({
        content:
          "🚫 У вас нет прав для понижения игроков. Это могут делать только администраторы, КМД и командиры.",
        ephemeral: true,
      });
    }

    if (authorHighestRole.index >= targetHighestRole.index) {
      return message.reply(
        "🛑 Вы не можете понизить пользователя с равной или более высокой ролью."
      );
    }

    if (targetHighestRole.roleId === CONFIG.ROLES.RECRUIT) {
      const promptMsg = await message.reply(
        "Вы пытаетесь понизить игрока до уровня 'Гость'. Выберите одну из следующих опций:\n" +
          "1. Сделать пользователя гостем\n" +
          "2. Исключить пользователя из сервера\n" +
          "Ответьте 1 или 2 в течение 30 секунд, иначе команда будет отменена."
      );

      const filter = (response) =>
        response.author.id === message.author.id &&
        ["1", "2"].includes(response.content);

      try {
        const collected = await message.channel.awaitMessages({
          filter,
          max: 1,
          time: 30000,
          errors: ["time"],
        });

        const response = collected.first().content;

        if (response === "1") {
          await targetMember.roles.set([CONFIG.ROLES.GUEST]);
          await sendMessageToChannel(
            CONFIG.CHANNELS.BOT_CONTROL_LOG,
            `<@${message.author.id}> понизил <@${targetMember.id}> до гостя.`
          );
          return message.reply("Игрок понижен до гостя.");
        } else if (response === "2") {
          try {
            await targetMember.send("Вас исключили из сервера.");
          } catch (error) {
            console.error("Не удалось отправить сообщение в ЛС:", error);
          }
          await targetMember.kick("Открываю двери...");
          await sendMessageToChannel(
            "1320713497075781703",
            `# :no_entry: <@${targetMember.id}> больше не с нами.`
          );
          return message.reply("Игрок исключен из сервера.");
        }
      } catch (error) {
        return message.reply("⏱️ Время ожидания истекло. Команда отменена.");
      }
    }

    const currentRoleIndex = targetHighestRole.index;
    const newRoleIndex = currentRoleIndex + 1;
    const newRoleId = roleHierarchy[newRoleIndex];

    if (!newRoleId) {
      return message.reply("🚫 Невозможно понизить ниже текущей роли.");
    }

    const newRole = guild.roles.cache.get(newRoleId);
    if (!newRole) {
      return message.reply("🚫 Не удалось найти роль для понижения.");
    }

    await targetMember.roles.add(newRoleId);
    await targetMember.roles.remove(targetHighestRole.roleId);

    await sendMessageToChannel(
      CONFIG.CHANNELS.BOT_CONTROL_LOG,
      `<@${message.author.id}> понизил <@${targetMember.id}> до роли ${newRole.name}.`
    );
    await sendMessageToChannel(
      "1320713497075781703",
      `# :arrow_down: <@${targetMember.id}> понижен до роли ${newRole.name}.`
    );

    return message.reply(`Игрок понижен до роли ${newRole.name}.`);
  } catch (error) {
    console.error("Ошибка в обработке понижения:", error);
    return message.reply("Произошла ошибка при понижении игрока.");
  }
}
client.once(Events.ClientReady, () => {
  console.log("Бот ДШБ запущен в онлайн! Не закрывайте консоль.");
  updateBotStatus();
  setInterval(updateBotStatus, 60 * 1000);
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await member.guild.roles.fetch();
    await member.guild.channels.fetch();

    const guestRole = member.guild.roles.cache.get(CONFIG.ROLES.GUEST);
    if (!guestRole) {
      throw new Error("Guest role not found");
    }

    await member.roles.add(guestRole);
    const logChannel = member.guild.channels.cache.get(
      CONFIG.CHANNELS.BOT_CONTROL_LOG
    );

    if (logChannel) {
      await logChannel.send(
        `✅ Роль "гость" выдана новоприбывшему: <@${member.user.id}>`
      );
    }
  } catch (error) {
    console.error("Error assigning guest role:", error);
    const logChannel = member.guild.channels.cache.get(
      CONFIG.CHANNELS.BOT_CONTROL_LOG
    );
    if (logChannel) {
      await logChannel.send(
        `❌ Ошибка при выдаче роли игроку: ${member.user.tag}\nError: ${error.message}. Пожалуйтесь Billie Joe`
      );
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith(PREFIX + "рекрут")) {
    try {
      const member = message.member;
      if (!member) {
        return message.reply("Не могу найти информацию о твоем аккаунте.");
      }

      if (!member.roles.cache.has(CONFIG.ROLES.RECRUIT)) {
        return message.reply({
          content:
            "⛔Эта команда доступна только для игроков с ролью 'Рекрут'.",
          ephemeral: true,
        });
      }

      const promotionDate = getPromotionDate(member);
      if (!promotionDate) {
        return message.reply(
          "Не удалось найти дату твоего повышения. Обратись к администрации."
        );
      }

      const currentDate = new Date();
      const timeLeft = new Date(promotionDate);
      timeLeft.setDate(timeLeft.getDate() + 14);
      const daysLeft = Math.floor(
        (timeLeft - currentDate) / (1000 * 60 * 60 * 24)
      );

      if (daysLeft > 0) {
        return message.reply(
          `⏱️У тебя осталось ${daysLeft} дней до возможного повышения до роли 'Стрелок' и принятия в основной состав. Покажи себя!`
        );
      } else {
        await sendMessageToChannel(
          CONFIG.CHANNELS.BOT_CONTROL_LOG,
          `📅 Срок рекрутства истек для <@${member.id}>`
        );
        return message.reply(
          "📅2 недели истекло. Я отправил уведомление старшим командирам. Ожидай решения."
        );
      }
    } catch (error) {
      console.error("Error handling recruit command:", error);
      return message.reply("Произошла ошибка при выполнении команды.");
    }
  }

  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(" ");
    const displayNameToSearch = args[0];
    const command = args[1]?.toLowerCase();
    let stats = message.content.toLowerCase().startsWith(PREFIX + "stats");

    if (!stats) {
      try {
        const guild = message.guild;
        if (!guild)
          return message.reply("Эта команда доступна только в сервере.");

        await guild.members.fetch();
        const targetMember = guild.members.cache.find((m) =>
          m.displayName
            .toLowerCase()
            .includes(displayNameToSearch.toLowerCase())
        );

        if (!targetMember) {
          return message.reply("Игрок с таким никнеймом не найден.");
        }

        const authorHighestRole = getHighestRole(message.member);
        const targetHighestRole = getHighestRole(targetMember);

        if (!authorHighestRole.roleId || !targetHighestRole.roleId) {
          return message.reply(
            "Не удалось определить роли. Зовите Billie Joe."
          );
        }

        if (command === "понизить") {
          await handleDemotion(
            message,
            targetMember,
            authorHighestRole,
            targetHighestRole,
            guild
          );
        } else if (command === "повысить") {
          await handlePromotion(
            message,
            targetMember,
            authorHighestRole,
            targetHighestRole,
            guild
          );
        }
      } catch (error) {
        console.error("Error handling command:", error);
        await message.reply(
          "Произошла ошибка при выполнении команды. Жалуйтесь Billie Joe"
        );
      }
    }
  }

  if (message.content.startsWith("*объявление")) {
    const member = message.member;
    if (!member) return;

    const hasAdminRole = member.roles.cache.some((role) =>
      CONFIG.ADMIN_ROLES.includes(role.id)
    );

    if (!hasAdminRole) {
      return message.reply({
        content: "Вы не можете делать объявления",
        ephemeral: true,
      });
    }

    const announcementContent = message.content
      .slice("*объявление".length)
      .trim();

    if (!announcementContent) {
      return message.reply("Пожалуйста, укажите текст объявления.");
    }

    try {
      await sendMessageToChannel(
        CONFIG.CHANNELS.ANNOUNCEMENTS,
        announcementContent
      );
      await message.reply("Объявление успешно отправлено!");
    } catch (error) {
      console.error("Ошибка при отправке объявления:", error);
      return message.reply("Произошла ошибка при отправке объявления.");
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isUserContextMenuCommand()) return;

  const invokingUser = interaction.user;
  const targetUser = interaction.targetUser;
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({
      content: "Команда действует только на сервере",
      ephemeral: true,
    });
  }

  const invokingMember = await guild.members.fetch(invokingUser.id);
  const targetMember = await guild.members.fetch(targetUser.id);

  if (!invokingMember || !targetMember) {
    return interaction.reply({
      content: "Не могу достать инфу об игроке",
      ephemeral: true,
    });
  }

  if (!hasRequiredRole(invokingMember)) {
    return interaction.reply({
      content:
        "🚫 У вас нет прав для управления ролями игроков. Это могут делать только администраторы, КМД и командиры.",
      ephemeral: true,
    });
  }

  const context = {
    author: invokingUser,
    member: invokingMember,
    channel: interaction.channel,
    reply: (content) =>
      interaction.reply(
        typeof content === "string"
          ? { content, ephemeral: true }
          : { ...content, ephemeral: true }
      ),
    user: invokingUser,
  };

  if (interaction.commandName === "🚀Повысить") {
    try {
      await handlePromotion(
        context,
        targetMember,
        getHighestRole(invokingMember),
        getHighestRole(targetMember),
        guild
      );
    } catch (error) {
      console.error("Error during promotion:", error);
      await interaction.reply({
        content: "Произошла ошибка. Возможно у вас не хватает прав.",
        ephemeral: true,
      });
    }
  } else if (interaction.commandName === "Понизить") {
    try {
      await handleDemotion(
        context,
        targetMember,
        getHighestRole(invokingMember),
        getHighestRole(targetMember),
        guild
      );
    } catch (error) {
      console.error("Error during demotion:", error);
      await interaction.reply({
        content: "Произошла ошибка. Возможно у вас не хватает прав.",
        ephemeral: true,
      });
    }
  } else if (interaction.commandName === "Забанить") {
    if (hasRequiredRole(invokingMember)) {
      try {
        if (
          getHighestRole(targetMember).index <=
          getHighestRole(invokingMember).index
        ) {
          return interaction.reply({
            content:
              "Вы не можете забанить этого пользователя. У него слишком высокий ранг.",
            ephemeral: true,
          });
        }

        await targetMember.ban({ reason: "Нарушение правил" });

        await interaction.reply({
          content: `<@${targetMember.id}> был успешно забанен.`,
          ephemeral: true,
        });
        await sendMessageToChannel(
          CONFIG.CHANNELS.BOT_CONTROL_LOG,
          `<@${invokingUser.id}> забанил игрока <@${targetMember.id}>`
        );
        await sendMessageToChannel(
          "1320713497075781703",
          `# :x: Игрок <@${targetMember.id}> выгнан из ДШБ за нарушение правил.`
        );
      } catch (error) {
        console.error("Error banning member:", error);
        await interaction.reply({
          content: "Не удалось забанить этого пользователя.",
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({
        content: "У вас нет прав банить игроков.",
        ephemeral: true,
      });
      await sendMessageToChannel(
        CONFIG.CHANNELS.BOT_CONTROL_LOG,
        `<@${invokingUser.id}> пытался забанить <@${targetMember.id}>`
      );
    }
  }
});

// Stats functionality
let playerData = JSON.parse(fs.readFileSync("players.json", "utf8"));

function savePlayerData() {
  fs.writeFileSync("players.json", JSON.stringify(playerData, null, 2), "utf8");
}

client.on("messageCreate", async (message) => {
  if (message.content.toLowerCase().startsWith("!stats")) {
    const discordId = message.author.id;

    // Проверка данных
    let steamId = playerData[discordId];
    if (!steamId) {
      // спросить данные если нет
      message.reply(
        "Ваш SteamID не найден. Напишите мне свой SteamID, чтоб я его сохранил"
      );

      // взять данные стим с сообщения
      const filter = (response) => response.author.id === discordId;
      const collector = message.channel.createMessageCollector({
        filter,
        time: 30000,
        max: 1,
      });

      collector.on("collect", (msg) => {
        steamId = msg.content.trim();
        if (!/^\d{17}$/.test(steamId)) {
          // стим 17 цифр
          return message.reply("Неверный SteamID. Он состоит из 17 цифр.");
        }

        // Сохранение
        playerData[discordId] = steamId;
        savePlayerData();

        message.reply(
          "Ваш SteamID успешно сохранён! Используйте команду `!stats` снова для просмотра статистики."
        );
      });

      collector.on("end", (collected) => {
        if (collected.size === 0) {
          message.reply(
            "Вы не предоставили SteamID вовремя. Попробуйте снова."
          );
        }
      });

      return;
    }

    // адрес запроса
    const apiUrl = `https://sqstat.ru/api/player/stats.php?steam_id=${steamId}&full=true`;

    try {
      // получение данных с запроса
      const response = await axios.get(apiUrl);
      const data = response.data;

      // переменные статы
      const onlineTime = data.stats[0].value || "N/A";
      const favKit = data.stats[2].value || "N/A";
      const matchQty = data.stats[3].value || "N/A";
      const winrate = data.stats[4].value || "N/A";
      const kd = data.stats[5].value || "N/A";
      const kills = data.stats[6].value || "N/A";
      const deaths = data.stats[7].value || "N/A";
      const revive = data.stats[8].value || "N/A";
      const weapon = data.weapons.weapon || "N/A";

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(" 📊Ваша статистика")
        .addFields(
          {
            name: "Скилл",
            value: `
        **K/D**: ${kd}
        **Время онлайн**: ${onlineTime}
        **Убийства**: ${kills}
        **Смерти**: ${deaths}
        **Поднятий**: ${revive}
        **Любимый кит**: ${favKit}
        **Матчей сыграно**: ${matchQty}
        **Винрейт**: ${winrate}
      `,
            inline: true,
          },
          {
            name: "Оружие",
            value: `${Object.keys(data.weapons.weapon)[0]}\n${
              Object.keys(data.weapons.weapon)[1]
            }\n${Object.keys(data.weapons.weapon)[2]}\n${
              Object.keys(data.weapons.weapon)[3]
            }\n${Object.keys(data.weapons.weapon)[4]}\n${
              Object.keys(data.weapons.weapon)[5]
            }\n${Object.keys(data.weapons.weapon)[6]}`,
            inline: true,
          },
          {
            name: "Убийства",
            value: `${weapon[Object.keys(data.weapons.weapon)[0]].cnt}\n${
              weapon[Object.keys(data.weapons.weapon)[1]].cnt
            }\n${weapon[Object.keys(data.weapons.weapon)[2]].cnt}\n${
              weapon[Object.keys(data.weapons.weapon)[3]].cnt
            }\n${weapon[Object.keys(data.weapons.weapon)[4]].cnt}\n${
              weapon[Object.keys(data.weapons.weapon)[5]].cnt
            }\n${weapon[Object.keys(data.weapons.weapon)[6]].cnt}\n`,
            inline: true,
          }
        )
        .setFooter({ text: "источник: Русское Сообщество" });

      // ОТвет

      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching stats:", error);

      // ошибка
      message.reply(
        "Произошла ошибка при получении ваших статистик. Пожалуйста, проверьте ваш SteamID и отправьте его заново."
      );

      // Новый стим
      const filter = (response) => response.author.id === discordId;
      const collector = message.channel.createMessageCollector({
        filter,
        time: 30000,
        max: 1,
      });

      collector.on("collect", (msg) => {
        steamId = msg.content.trim();
        if (!/^\d{17}$/.test(steamId)) {
          return message.reply(
            "Неверный SteamID. Убедитесь, что вы ввели корректный ID."
          );
        }

        // сохранение
        playerData[discordId] = steamId;
        savePlayerData();

        message.reply(
          "Ваш SteamID успешно обновлён! Используйте команду `!stats` снова для просмотра статистики."
        );
      });

      collector.on("end", (collected) => {
        if (collected.size === 0) {
          message.reply(
            "Вы не предоставили SteamID вовремя. Попробуйте снова."
          );
        }
      });
    }
  }
});

client.login(token);
