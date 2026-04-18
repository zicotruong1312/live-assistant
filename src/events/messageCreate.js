const DailyStats = require('../models/DailyStats');
const LiveMatch = require('../models/LiveMatch');
const { getTodayVN } = require('../utils/dateHelper');
const { analyzeValorantScoreboard } = require('../utils/geminiVision');

// Tên channel hoặc một phần tên channel nơi vợ quăng ảnh kết quả
// Bot sẽ lắng nghe BẤT KỲ channel nào có chứa 1 trong các chuỗi này
const LIVE_CHANNEL_KEYWORDS = ['live', 'ticket', 'điểm', 'result', 'kết quả', 'scoreboard'];

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    // ─── PHẦN 1: Đếm số tin nhắn hàng ngày (giữ nguyên từ bản gốc) ───
    const today = getTodayVN();
    try {
      await DailyStats.findOneAndUpdate(
        { userId: message.author.id, guildId: message.guild.id, date: today },
        {
          $inc: { messageCount: 1 },
          $set: { username: message.author.username }
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      if (err.code !== 11000) {
        console.error('[messageCreate] Lỗi DB DailyStats:', err.message);
      }
    }

    // ─── PHẦN 2: Tự động tạo Ticket khi có ảnh gửi vào kênh Live ───
    const channelName = message.channel.name.toLowerCase();
    const isLiveChannel = LIVE_CHANNEL_KEYWORDS.some(kw => channelName.includes(kw));

    if (!isLiveChannel) return;
    if (message.attachments.size === 0) return;

    const attachment = message.attachments.first();
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) return;

    // Thông báo đang xử lý
    const loadingMsg = await message.reply('⏳ Đang nhờ AI phân tích ảnh và chụp danh sách Voice. Vui lòng đợi...');

    try {
      // Chụp lại danh sách người đang ngồi Voice lúc vợ quăng ảnh
      let voiceSnapshot = [];
      if (message.member?.voice?.channel) {
        voiceSnapshot = message.member.voice.channel.members
          .filter(m => !m.user.bot)
          .map(m => m.id);
      }

      // Gọi Gemini AI phân tích ảnh
      const extractedData = await analyzeValorantScoreboard(attachment.url);

      // Sinh Ticket ID ngẫu nhiên
      const ticketId = `TCK-${Date.now().toString().slice(-5)}`;

      // Lưu Ticket vào DB với trạng thái PENDING
      await new LiveMatch({
        ticketId,
        channelId:  message.channel.id,
        messageId:  message.id,
        guildId:    message.guild.id,
        imageUrl:   attachment.url,
        extractedData,
        voiceSnapshot,
        selectedPlayers: voiceSnapshot // Mặc định là người trong Voice, sếp có thể chỉnh sau
      }).save();

      // Tạo nội dung reply
      let replyContent = `🎫 **Ticket #${ticketId} đã được tạo thành công!**\n`;
      replyContent += `> 🗺️ **Map:** \`${extractedData.map}\`\n`;
      replyContent += `> 🎮 **Chế độ:** \`${extractedData.mode}\`\n`;
      replyContent += `> 🏆 **Kết quả:** \`${extractedData.result}\`\n`;
      replyContent += `> 👥 **Voice Snapshot:** ${voiceSnapshot.length} người (${voiceSnapshot.map(id => `<@${id}>`).join(', ') || 'Không có ai trong room'})\n`;
      replyContent += `\nTicket đang ở trạng thái **ĐANG CHỜ DUYỆT**. Sếp tổng sáng dậy gõ \`/livereview\` để duyệt điểm nhé! 😴`;

      if (!extractedData.isRanked) {
        replyContent += `\n\n> ⚠️ **CẢNH BÁO:** AI nhận diện chế độ này **KHÔNG PHẢI Đấu Hạng (Competitive)**. Sếp tổng cân nhắc trước khi Approve!`;
      }

      await loadingMsg.edit(replyContent);

    } catch (err) {
      console.error('[messageCreate] Lỗi tạo Ticket:', err);
      await loadingMsg.edit('❌ Có lỗi xảy ra khi tạo Ticket. Vui lòng thử lại hoặc báo cho Admin.');
    }
  }
};
