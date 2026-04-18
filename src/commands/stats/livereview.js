const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const LiveMatch = require('../../models/LiveMatch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livereview')
    .setDescription('[Admin Only] Duyệt Ticket tính điểm trận đấu – AI đã phân tích sẵn'),

  async execute(interaction) {
    // Chỉ Admin được duyệt
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({
        content: '🚫 Chỉ có **Admin** mới có quyền duyệt Ticket điểm Live!',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    // Lấy Ticket PENDING cũ nhất trong server này
    const match = await LiveMatch.findOne({
      guildId: interaction.guildId,
      status: 'PENDING'
    }).sort({ createdAt: 1 });

    if (!match) {
      return interaction.editReply('🎉 **Tuyệt!** Hiện không có Ticket nào đang chờ duyệt.');
    }

    const { ticketId, extractedData, imageUrl, voiceSnapshot, selectedPlayers, mvpId } = match;

    // Tính thời gian tạo Ticket
    const createdTime = `<t:${Math.floor(match.createdAt.getTime() / 1000)}:R>`;

    // ─── Tạo Embed ───
    const embed = new EmbedBuilder()
      .setColor(extractedData.isRanked ? '#00b4d8' : '#ff6b6b')
      .setTitle(`🎫 Ticket Duyệt Điểm: #${ticketId}`)
      .setDescription('AI đã tự động quét thông tin từ ảnh bảng điểm. Kiểm tra và phân bổ điểm bên dưới.')
      .addFields(
        { name: '🗺️ Map (AI)', value: `\`${extractedData.map}\``, inline: true },
        { name: '🎮 Chế Độ', value: `\`${extractedData.mode}\``, inline: true },
        { name: '🏆 Kết Quả (AI)', value: `\`${extractedData.result}\``, inline: true },
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

    // ─── Các Components ───

    // Menu 1: Chọn người chỉnh tay danh sách người chơi (thêm bớt thoải mái)
    const playerMenu = new UserSelectMenuBuilder()
      .setCustomId(`live_players_${ticketId}`)
      .setPlaceholder('① Chọn những ai THỰC SỰ đã chơi trận này...')
      .setMinValues(0)
      .setMaxValues(10);

    // Menu 2: Bầu MVP
    const mvpMenu = new UserSelectMenuBuilder()
      .setCustomId(`live_mvp_${ticketId}`)
      .setPlaceholder('② Bầu chọn 1 MVP xuất sắc nhất...')
      .setMinValues(1)
      .setMaxValues(1);

    // Buttons hành động
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

    const btnSkip = new ButtonBuilder()
      .setCustomId(`live_skip_${ticketId}`)
      .setLabel('⏭ Bỏ qua, xem Ticket tiếp theo')
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(playerMenu);
    const row2 = new ActionRowBuilder().addComponents(mvpMenu);
    const row3 = new ActionRowBuilder().addComponents(btnApproveWin, btnApproveLose, btnDecline, btnSkip);

    await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
  }
};
