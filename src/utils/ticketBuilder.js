const {
  EmbedBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const LiveMatch = require('../models/LiveMatch');

/**
 * Tên channel cố định (phải khớp với tên channel trong Discord):
 *   - LIVE_RESULT_CHANNEL: Vợ quăng ảnh scoreboard vào đây
 *   - CONFIRM_RESULT_CHANNEL: Bot tự động post Ticket để sếp duyệt
 */
const LIVE_RESULT_CHANNEL   = 'live-result';
const CONFIRM_RESULT_CHANNEL = 'confirm-result';

/**
 * Build Ticket Message (dùng chung cho cả auto-post và /livereview)
 */
function buildTicketMessage(match) {
  const { ticketId, extractedData, imageUrl, selectedPlayers, mvpId, createdAt } = match;
  const createdTime = `<t:${Math.floor(createdAt.getTime() / 1000)}:R>`;

  const embed = new EmbedBuilder()
    .setColor(extractedData.isRanked ? '#00b4d8' : '#ff6b6b')
    .setTitle(`🎫 Ticket Duyệt Điểm: #${ticketId}`)
    .setDescription('AI đã tự động quét thông tin từ ảnh bảng điểm. Kiểm tra rồi duyệt bên dưới.')
    .addFields(
      { name: '🗺️ Map (AI)', value: `\`${extractedData.map}\``, inline: true },
      { name: '🎮 Chế Độ', value: `\`${extractedData.mode}\``, inline: true },
      { name: '📊 Tỉ Số (AI)', value: `\`${extractedData.score || 'Unknown'}\``, inline: true },
      { name: '🏆 Kết Quả (AI)', value: `\`${extractedData.result}\``, inline: true },
      { name: '✅ Thắng/Thua', value: `\`${extractedData.winLose || 'UNKNOWN'}\``, inline: true },
      { name: '🌟 Match MVP (AI)', value: `\`${extractedData.mvp || 'Unknown'}\``, inline: true },
      { name: '🌟 Team MVP (AI)', value: `\`${extractedData.teamMvp || 'Unknown'}\``, inline: true },
      {
        name: '👥 Người Chơi Hiện Tại',
        value: selectedPlayers.length > 0
          ? selectedPlayers.map(id => `<@${id}>`).join(', ')
          : '_Chưa có ai – Hãy chọn từ menu bên dưới_'
      },
      { name: '⭐ MVP', value: mvpId ? `<@${mvpId}>` : '_Chưa chọn_', inline: true },
      { name: '🕐 Tạo lúc', value: createdTime, inline: true }
    )
    .setImage(imageUrl)
    .setFooter({ text: '① Chọn người chơi → ② Bầu MVP → ③ Bấm Duyệt' });

  if (!extractedData.isRanked) {
    embed.addFields({
      name: '⚠️ CẢNH BÁO CHẾ ĐỘ CHƠI',
      value: '**AI phát hiện đây KHÔNG PHẢI Đấu Hạng (Competitive). Mọi điểm sẽ = 0 nếu Approve. Xem xét Decline!**'
    });
  }

  const playerMenu = new UserSelectMenuBuilder()
    .setCustomId(`live_players_${ticketId}`)
    .setPlaceholder('① Chọn những ai THỰC SỰ đã chơi trận này...')
    .setMinValues(0)
    .setMaxValues(10);

  const mvpMenu = new UserSelectMenuBuilder()
    .setCustomId(`live_mvp_${ticketId}`)
    .setPlaceholder('② Bầu chọn 1 MVP xuất sắc nhất...')
    .setMinValues(1)
    .setMaxValues(1);

  const btnApproveWin = new ButtonBuilder()
    .setCustomId(`live_approve_win_${ticketId}`)
    .setLabel('✅ Duyệt – THẮNG (+80đ/người, MVP +100đ)')
    .setStyle(ButtonStyle.Success);

  const btnApproveLose = new ButtonBuilder()
    .setCustomId(`live_approve_lose_${ticketId}`)
    .setLabel('📘 Duyệt – THUA (+50đ/người)')
    .setStyle(ButtonStyle.Primary);

  const btnDecline = new ButtonBuilder()
    .setCustomId(`live_decline_${ticketId}`)
    .setLabel('❌ Từ Chối / Xoá Ticket')
    .setStyle(ButtonStyle.Danger);

  const row1 = new ActionRowBuilder().addComponents(playerMenu);
  const row2 = new ActionRowBuilder().addComponents(mvpMenu);
  const row3 = new ActionRowBuilder().addComponents(btnApproveWin, btnApproveLose, btnDecline);

  return { embeds: [embed], components: [row1, row2, row3] };
}

/**
 * Auto-post Ticket vào #confirm-result sau khi vợ quăng ảnh vào #live-result
 */
async function postTicketToConfirmChannel(guild, match) {
  const confirmChannel = guild.channels.cache.find(
    c => c.name === CONFIRM_RESULT_CHANNEL && c.isTextBased()
  );

  if (!confirmChannel) {
    console.warn(`[ticketAutoPost] ⚠️ Không tìm thấy channel #${CONFIRM_RESULT_CHANNEL} trong server.`);
    return;
  }

  const payload = buildTicketMessage(match);
  await confirmChannel.send(payload);
  console.log(`[ticketAutoPost] ✅ Đã post Ticket #${match.ticketId} vào #${CONFIRM_RESULT_CHANNEL}`);
}

module.exports = {
  LIVE_RESULT_CHANNEL,
  CONFIRM_RESULT_CHANNEL,
  buildTicketMessage,
  postTicketToConfirmChannel
};
