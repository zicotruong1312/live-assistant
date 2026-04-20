const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DailyStats = require('../../models/DailyStats');
const { getTimeframeMatch, formatDuration } = require('../../utils/dateHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Xem bảng xếp hạng điểm số (1 tin/1đ, 1p voice/1đ).')
    .addStringOption(option =>
      option
        .setName('time')
        .setDescription('Khoảng thời gian xếp hạng')
        .setRequired(true)
        .addChoices(
          { name: '📅 Hôm nay', value: 'today' },
          { name: '🗓️ 7 ngày qua', value: 'week' },
          { name: '📆 Tháng này', value: 'month' },
          { name: '🌟 Năm nay', value: 'year' },
          { name: '🔥 Toàn thời gian', value: 'all' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const timeframe = interaction.options.getString('time');
    const matchDate = getTimeframeMatch(timeframe);
    const guildId = interaction.guild.id;

    // 1. Lấy dữ liệu chat/voice theo thời gian
    const pipeline = [
      { $match: { guildId, ...matchDate } },
      {
        $group: {
          _id: "$userId",
          totalMessages: { $sum: "$messageCount" },
          totalVoice: { $sum: "$voiceDuration" }
        }
      }
    ];
    const dailyData = await DailyStats.aggregate(pipeline);

    // 2. Lấy dữ liệu trận đấu (LiveStats) toàn thời gian
    const UserLiveStats = require('../../models/UserLiveStats');
    const liveData = await UserLiveStats.find({ guildId });

    // 3. Gộp 2 loại dữ liệu bằng một Map
    const userMap = new Map();

    // Khởi tạo map từ dailyData
    for (const d of dailyData) {
      const msgs = d.totalMessages || 0;
      const voiceMins = Math.floor((d.totalVoice || 0) / 60);
      const socialPoints = msgs + voiceMins;
      
      userMap.set(d._id, {
        userId: d._id,
        messages: msgs,
        voiceMins,
        socialPoints,
        gamePoints: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        mvpCount: 0
      });
    }

    // Gộp dữ liệu trận đấu (cộng dồn bất kể timeframe)
    for (const l of liveData) {
      const uId = l.userId;
      if (!userMap.has(uId)) {
        userMap.set(uId, {
          userId: uId,
          messages: 0,
          voiceMins: 0,
          socialPoints: 0,
          gamePoints: 0,
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          mvpCount: 0
        });
      }
      const u = userMap.get(uId);
      u.gamePoints = l.totalPoints || 0;
      u.matchesPlayed = l.matchesPlayed || 0;
      u.matchesWon = l.matchesWon || 0;
      u.matchesLost = l.matchesLost || 0;
      u.mvpCount = l.mvpCount || 0;
    }

    // 4. Tính tổng điểm và sắp xếp
    const allUsers = Array.from(userMap.values());
    allUsers.forEach(u => {
      u.totalScore = u.socialPoints + u.gamePoints;
    });

    // Lọc ra ai có điểm > 0 và sắp xếp
    const top10 = allUsers
      .filter(u => u.totalScore > 0 || u.matchesPlayed > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);

    let timeLabel = '';
    if (timeframe === 'today') timeLabel = 'Hôm nay';
    if (timeframe === 'week') timeLabel = '7 Ngày Qua';
    if (timeframe === 'month') timeLabel = 'Tháng Này';
    if (timeframe === 'year') timeLabel = 'Năm Nay';
    if (timeframe === 'all') timeLabel = 'Toàn Thời Gian';

    if (!top10.length) {
      return interaction.editReply(`📭 Chưa có dữ liệu thống kê cho **${timeLabel}**.`);
    }

    const medals = ['🥇', '🥈', '🥉'];

    const rows = top10.map((entry, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      
      const parts = [`💬 ${entry.messages} tin`, `🎙️ ${entry.voiceMins} phút`];
      if (entry.matchesPlayed > 0) {
        parts.push(`🎮 ${entry.matchesPlayed} trận (${entry.matchesWon}W - ${entry.matchesLost}L)`);
      }
      
      return `${medal} <@${entry.userId}> — **${entry.totalScore} Điểm**\n└ ${parts.join(' | ')}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`🏆 BẢNG XẾP HẠNG ĐIỂM SỐ — ${timeLabel}`)
      .setDescription(rows.join('\n\n'))
      .setFooter({ text: '1 tin = 1đ | 1 phút voice = 1đ | Điểm game (vĩnh viễn)' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
