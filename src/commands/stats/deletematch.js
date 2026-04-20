const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const LiveMatch = require('../../models/LiveMatch');
const UserLiveStats = require('../../models/UserLiveStats');

const POINTS = {
  WIN_BASE:  80,
  LOSE_BASE: 50,
  MVP_BONUS: 20
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletematch')
    .setDescription('Xoá một trận đấu đã duyệt (huỷ kết quả & trừ lại điểm) (Chỉ Admin)')
    .addStringOption(option =>
      option
        .setName('ticket_id')
        .setDescription('Mã Ticket (Ví dụ: TCK-12345)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '🚫 Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
    }

    const rawTicketId = interaction.options.getString('ticket_id').trim();
    // Support formats like "TCK-12345" or just "12345"
    const ticketId = rawTicketId.startsWith('TCK-') ? rawTicketId : `TCK-${rawTicketId}`;

    await interaction.deferReply({ ephemeral: true });

    try {
      const match = await LiveMatch.findOne({ ticketId, guildId: interaction.guild.id });
      if (!match) {
        return interaction.editReply(`❌ Không tìm thấy Ticket \`${ticketId}\` trong Database!`);
      }

      // Revert points if match was already APPROVED
      if (match.status === 'APPROVED' && match.selectedPlayers.length > 0) {
        const isWin = (match.extractedData.result === 'VICTORY' || match.extractedData.winLose === 'THẮNG');
        const isLose = !isWin;
        const basePoints = isWin ? POINTS.WIN_BASE : POINTS.LOSE_BASE;

        for (const userId of match.selectedPlayers) {
          const isMvp = (userId === match.mvpId);
          const mvpBonus = (isMvp && isWin) ? POINTS.MVP_BONUS : 0;
          const pointsToDeduct = basePoints + mvpBonus;

          await UserLiveStats.findOneAndUpdate(
            { userId, guildId: interaction.guild.id },
            {
              $inc: {
                totalPoints:   -pointsToDeduct,
                matchesPlayed: -1,
                matchesWon:    isWin  ? -1 : 0,
                matchesLost:   isLose ? -1 : 0,
                mvpCount:      isMvp  ? -1 : 0
              }
            }
          );
        }
      }

      // Xoá match khỏi DB
      await LiveMatch.deleteOne({ ticketId });

      const adminAction = match.status === 'APPROVED' 
        ? `✅ Đã xoá Ticket \`${ticketId}\` VÀ **đã thu hồi toàn bộ điểm** của những người tham gia.` 
        : `✅ Đã xoá Ticket \`${ticketId}\` (Trận này chưa duyệt nên không cần thu hồi điểm).`;

      // Thông báo Public vào channel hiện tại (để có log công khai tác vụ của admin)
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗑️ Thu Hồi Kết Quả Trận Đấu')
        .setDescription(adminAction)
        .setFooter({ text: `Xử lý bởi: ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ content: 'Xử lý thành công!' });
      await interaction.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('[deletematch] Lỗi:', error);
      await interaction.editReply('❌ Có lỗi xảy ra khi xoá trận đấu!');
    }
  }
};
