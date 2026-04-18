require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const connectDB = require('./utils/connectDB');
const startWebServer = require('./utils/webServer');
const registerCronJobs = require('./utils/cronJobs');
const { scanActiveVoices, startVoiceSyncLoop } = require('./utils/voiceTracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

// Kết nối DB & khởi tạo Web Server
connectDB();
startWebServer();

// ─── TẢI SLASH COMMANDS KHỞI DỰNG ──────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  if (fs.statSync(folderPath).isDirectory()) {
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[WARNING] Command tại ${filePath} thiếu 'data' hoặc 'execute'.`);
      }
    }
  }
}

// ─── TẢI SỰ KIỆN (EVENTS) ──────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// ─── LẮNG NGHE INTERACTION TỪ SLASH COMMANDS ───────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`Không tìm thấy lệnh ${interaction.commandName}.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Lỗi thực thi lệnh ${interaction.commandName}]:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ Đã có lỗi xảy ra khi xử lý lệnh này!', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Đã có lỗi xảy ra khi xử lý lệnh này!', ephemeral: true });
    }
  }
});

// ─── BOT SAN SÀNG HOẠT ĐỘNG ────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} đã đăng nhập và sẵn sàng!`);
  
  // Đăng ký cronjob báo ngày / tuần
  registerCronJobs(client); 
  
  // Quét ai đang ở sẵn trong Voice và nạp vào bộ đếm realtime
  scanActiveVoices(client);
  
  // Kích hoạt đồng bộ Voice lên MongoDB mỗi 1 phút
  startVoiceSyncLoop();
});

// Đăng nhập vào Discord
client.login(process.env.DISCORD_TOKEN);
