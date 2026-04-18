const { SlashCommandBuilder } = require('discord.js');
const LiveMatch = require('../../models/LiveMatch');
const { buildTicketMessage } = require('../../utils/ticketBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livereview')
    .setDescription('[Admin Only] Hiện Ticket PENDING cũ nhất để duyệt điểm (phòng khi miss ở #confirm-result)'),

  async execute(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '🚫 Chỉ có **Admin** mới có quyền dùng lệnh này!',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const match = await LiveMatch.findOne({
      guildId: interaction.guildId,
      status: 'PENDING'
    }).sort({ createdAt: 1 });

    if (!match) {
      return interaction.editReply('🎉 Không có Ticket nào đang chờ duyệt.');
    }

    const payload = buildTicketMessage(match);
    await interaction.editReply(payload);
  }
};
