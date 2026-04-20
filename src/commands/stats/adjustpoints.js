const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const UserLiveStats = require('../../models/UserLiveStats');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adjustpoints')
    .setDescription('Tăng hoặc giảm điểm thực chiến cho một người chơi (Chỉ Admin)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Người chơi cần điều chỉnh điểm')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('points')
        .setDescription('Số điểm muốn cộng (nhập số âm để trừ)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Lý do điều chỉnh (Tuỳ chọn)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const pointsToAdjust = interaction.options.getInteger('points');
    const reason = interaction.options.getString('reason') || 'Không có lý do';
    const guildId = interaction.guild.id;

    // Chỉ Admin mới được dùng lệnh này, dù đã set DefaultMemberPermissions nhưng check lại cho chắc chắn.
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '🚫 Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
    }

    try {
      const stats = await UserLiveStats.findOneAndUpdate(
        { userId: targetUser.id, guildId },
        { $inc: { totalPoints: pointsToAdjust } },
        { upsert: true, new: true }
      );

      const actionText = pointsToAdjust >= 0 ? 'CỘNG THÊM' : 'TRỪ ĐI';
      const color = pointsToAdjust >= 0 ? '#57f287' : '#ed4245';

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('⚖️ Điều Chỉnh Điểm Hệ Thống')
        .addFields(
          { name: '👤 Người chơi', value: `<@${targetUser.id}>`, inline: true },
          { name: '🔄 Thao tác', value: `**${actionText} ${Math.abs(pointsToAdjust)} điểm**`, inline: true },
          { name: '💰 Tổng điểm hiện tại', value: `**${stats.totalPoints} điểm**`, inline: true },
          { name: '📝 Lý do', value: reason }
        )
        .setFooter({ text: `Điều chỉnh bởi Admin: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('[adjustpoints] Lỗi khi điều chỉnh điểm:', error);
      await interaction.reply({ content: '❌ Có lỗi xảy ra khi cập nhật Database.', ephemeral: true });
    }
  }
};
