const { EmbedBuilder } = require('discord.js');
const LiveMatch = require('../models/LiveMatch');
const UserLiveStats = require('../models/UserLiveStats');

// Cài đặt điểm thưởng
const POINTS = {
  WIN_BASE:  80,  // Điểm cơ bản khi thắng
  LOSE_BASE: 50,  // Điểm cơ bản khi thua (vẫn được điểm vì đã ra sân)
  MVP_BONUS: 20   // Điểm thưởng thêm cho MVP (chỉ tính khi trận Thắng)
};

// Tên channel thông báo kết quả cộng điểm
const BONUS_RESULT_CHANNEL = 'bonus-result';

/**
 * Xử lý toàn bộ tương tác Buttons & Select Menus của hệ thống Ticket Live.
 * Được gọi từ index.js trong event interactionCreate.
 */
module.exports = async (interaction) => {
  if (!interaction.customId?.startsWith('live_')) return;

  const customId = interaction.customId;
  // Luôn lấy phần cuối cùng làm ticketId để tránh lỗi với các prefix dài (ví dụ: live_approve_win_TCK-123)
  const ticketId = customId.split('_').pop();

  const match = await LiveMatch.findOne({ ticketId });
  if (!match) {
    return interaction.reply({ content: '❌ Không tìm thấy Ticket này trong cơ sở dữ liệu.', ephemeral: true });
  }

  // ─── 1. Menu chọn danh sách người chơi ───
  if (customId.startsWith('live_players_')) {
    await LiveMatch.updateOne({ ticketId }, { $set: { selectedPlayers: interaction.values } });

    const msg = match.selectedPlayers.length === 0
      ? '✅ Đã xoá toàn bộ người chơi. Ticket này sẽ không cộng điểm cho ai khi Approve.'
      : `✅ Đã cập nhật ${match.selectedPlayers.length} người chơi: ${match.selectedPlayers.map(id => `<@${id}>`).join(', ')}`;

    return interaction.reply({ content: msg, ephemeral: true });
  }

  // ─── 2. Menu chọn MVP ───
  if (customId.startsWith('live_mvp_')) {
    await LiveMatch.updateOne({ ticketId }, { $set: { mvpId: interaction.values[0] } });
    return interaction.reply({ content: `✅ Đã chốt <@${match.mvpId}> là MVP của trận này.`, ephemeral: true });
  }

  // ─── Các hành động sau đây chỉ dành cho Admin ───
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: '🚫 Chỉ Admin mới có quyền duyệt hoặc từ chối Ticket.', ephemeral: true });
  }

  // ─── 3. Nút Từ chối (Decline) ───
  if (customId.startsWith('live_decline_')) {
    await LiveMatch.updateOne({ ticketId }, { $set: { status: 'DECLINED' } });
    return interaction.update({
      content: `❌ Ticket **#${ticketId}** đã bị **TỪ CHỐI**. Không ai được cộng điểm.`,
      embeds: [], components: []
    });
  }

  // ─── 4. Nút Duyệt (Win hoặc Lose) ───
  const isWin  = customId.startsWith('live_approve_win_');
  const isLose = customId.startsWith('live_approve_lose_');

  if (isWin || isLose) {
    if (match.selectedPlayers.length === 0) {
      return interaction.reply({
        content: '⚠️ Danh sách người chơi đang trống! Hãy chọn ít nhất 1 người trước khi Duyệt.',
        ephemeral: true
      });
    }

    const { guildId } = match;
    const basePoints = isWin ? POINTS.WIN_BASE : POINTS.LOSE_BASE;

    const summaryLines = [];

    for (const userId of match.selectedPlayers) {
      const isMvp = (userId === match.mvpId);
      const mvpBonus = (isMvp && isWin) ? POINTS.MVP_BONUS : 0;
      const pointsEarned = basePoints + mvpBonus;

      await UserLiveStats.findOneAndUpdate(
        { userId, guildId },
        {
          $inc: {
            totalPoints:   pointsEarned,
            matchesPlayed: 1,
            matchesWon:    isWin  ? 1 : 0,
            matchesLost:   isLose ? 1 : 0,
            mvpCount:      isMvp  ? 1 : 0
          }
        },
        { upsert: true }
      );

      summaryLines.push({
        userId,
        pointsEarned,
        isMvp
      });
    }

    await LiveMatch.updateOne({ ticketId }, { $set: { status: 'APPROVED' } });

    // ── Cập nhật message trong #confirm-result: xoá components, giữ Embed nhỏ ──
    await interaction.update({
      content: `✅ **Ticket #${ticketId}** đã được duyệt bởi <@${interaction.user.id}>. Xem kết quả tại **#${BONUS_RESULT_CHANNEL}**.`,
      embeds: [], components: []
    });

    // ── Post thông báo chi tiết cộng điểm vào #bonus-result ──
    const bonusChannel = interaction.guild.channels.cache.find(
      c => c.name === BONUS_RESULT_CHANNEL && c.isTextBased()
    );

    if (bonusChannel) {
      const resultEmoji = isWin ? '🏆' : '💀';
      const resultText  = isWin ? 'VICTORY' : 'DEFEAT';

      const embed = new EmbedBuilder()
        .setColor(isWin ? '#57f287' : '#ed4245')
        .setTitle(`${resultEmoji} Kết Quả Trận #${ticketId} – ${resultText}`)
        .addFields(
          { name: '🗺️ Map', value: `\`${match.extractedData.map}\``, inline: true },
          { name: '🎮 Chế độ', value: `\`${match.extractedData.mode}\``, inline: true },
          { name: '📊 Tỉ số', value: `\`${match.extractedData.score || 'Unknown'}\``, inline: true },
          { name: '\u200B', value: '\u200B', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Duyệt bởi: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

      // Danh sách điểm từng người
      const pointsField = summaryLines.map(({ userId, pointsEarned, isMvp }) => {
        const mvpTag = isMvp ? ' ⭐ **MVP**' : '';
        return `> <@${userId}>: **+${pointsEarned} điểm**${mvpTag}`;
      }).join('\n');

      embed.addFields({ name: '🎁 Bảng Cộng Điểm', value: pointsField || '_Không có ai_' });



      await bonusChannel.send({ embeds: [embed] });
    } else {
      console.warn(`[ticketHandler] ⚠️ Không tìm thấy channel #${BONUS_RESULT_CHANNEL}`);
    }
  }
};
