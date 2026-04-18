const LiveMatch = require('../models/LiveMatch');
const UserLiveStats = require('../models/UserLiveStats');

// Cài đặt điểm thưởng
const POINTS = {
  WIN_BASE:  80,  // Điểm cơ bản khi thắng
  LOSE_BASE: 50,  // Điểm cơ bản khi thua (vẫn được điểm vì đã ra sân)
  MVP_BONUS: 20   // Điểm thưởng thêm cho MVP (chỉ tính khi trận Thắng)
};

/**
 * Xử lý toàn bộ tương tác Buttons & Select Menus của hệ thống Ticket Live.
 * Được gọi từ index.js trong event interactionCreate.
 */
module.exports = async (interaction) => {
  if (!interaction.customId?.startsWith('live_')) return;

  // Tách ticketId khỏi customId (ví dụ: live_players_TCK-1234 → TCK-1234)
  const customId = interaction.customId;
  // ticketId là phần sau prefix 3 từ (live_xxx_)
  const ticketId = customId.split('_').slice(2).join('_');

  const match = await LiveMatch.findOne({ ticketId });
  if (!match) {
    return interaction.reply({ content: '❌ Không tìm thấy Ticket này trong cơ sở dữ liệu.', ephemeral: true });
  }

  // ─── 1. Menu chọn danh sách người chơi ───
  if (customId.startsWith('live_players_')) {
    match.selectedPlayers = interaction.values; // values = [] nếu chọn 0 người (cho phép không cộng ai)
    await match.save();

    const msg = match.selectedPlayers.length === 0
      ? '✅ Đã xoá toàn bộ người chơi. Ticket này sẽ không cộng điểm cho ai khi Approve.'
      : `✅ Đã cập nhật danh sách ${match.selectedPlayers.length} người chơi: ${match.selectedPlayers.map(id => `<@${id}>`).join(', ')}`;

    return interaction.reply({ content: msg, ephemeral: true });
  }

  // ─── 2. Menu chọn MVP ───
  if (customId.startsWith('live_mvp_')) {
    match.mvpId = interaction.values[0];
    await match.save();
    return interaction.reply({ content: `✅ Đã chốt <@${match.mvpId}> là MVP của trận này.`, ephemeral: true });
  }

  // ─── Các hành động sau đây chỉ dành cho Admin ───
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: '🚫 Chỉ Admin mới có quyền duyệt hoặc từ chối Ticket.', ephemeral: true });
  }

  // ─── 3. Nút Bỏ qua – Xem Ticket kế tiếp ───
  if (customId.startsWith('live_skip_')) {
    // Đánh dấu bị skip bằng cách đổi status → DECLINED tạm (hoặc thêm field skipCount, nhưng dùng DECLINED cho đơn giản)
    // Thực ra ta chỉ cần ẩn message đi và gọi lại review
    return interaction.update({
      content: `⏭ Đã bỏ qua Ticket **#${ticketId}**. Gõ lại \`/livereview\` để xem Ticket tiếp theo.`,
      embeds: [], components: []
    });
  }

  // ─── 4. Nút Từ chối (Decline) ───
  if (customId.startsWith('live_decline_')) {
    match.status = 'DECLINED';
    await match.save();
    return interaction.update({
      content: `❌ Ticket **#${ticketId}** đã bị **TỪ CHỐI**. Không ai được cộng điểm.`,
      embeds: [], components: []
    });
  }

  // ─── 5. Nút Duyệt (Win hoặc Lose) ───
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

    // Điểm cơ bản = 0 nếu không phải Competitive
    const basePoints = match.extractedData.isRanked
      ? (isWin ? POINTS.WIN_BASE : POINTS.LOSE_BASE)
      : 0;

    const summaryLines = [];

    for (const userId of match.selectedPlayers) {
      const isMvp = (userId === match.mvpId);
      const mvpBonus = (isMvp && isWin && match.extractedData.isRanked) ? POINTS.MVP_BONUS : 0;
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

      summaryLines.push(`<@${userId}>: **+${pointsEarned}đ**${isMvp ? ' ⭐ MVP' : ''}`);
    }

    match.status = 'APPROVED';
    await match.save();

    const modeWarning = !match.extractedData.isRanked
      ? '\n> ⚠️ Chế độ không xếp hạng, điểm thực chiến = 0. Chỉ cộng số trận.'
      : '';

    return interaction.update({
      content: `✅ **Ticket #${ticketId} đã được DUYỆT** (${isWin ? '🏆 THẮNG' : '💀 THUA'})!\n\n${summaryLines.join('\n')}${modeWarning}`,
      embeds: [],
      components: []
    });
  }
};
