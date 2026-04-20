const DailyStats = require('../models/DailyStats');
const LiveMatch = require('../models/LiveMatch');
const { getTodayVN } = require('../utils/dateHelper');
const { analyzeValorantScoreboard } = require('../utils/geminiVision');
const { LIVE_RESULT_CHANNEL, postTicketToConfirmChannel } = require('../utils/ticketBuilder');

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

    // ─── PHẦN 2: Bắt ảnh từ kênh #live-result ───
    // Chỉ xử lý đúng channel tên "live-result"
    if (message.channel.name !== LIVE_RESULT_CHANNEL) return;
    if (message.attachments.size === 0) return;

    const attachment = message.attachments.first();
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) return;

    try {
      // Anti-duplicate: nếu message này đã được xử lý rồi thì bỏ qua.
      // (Giúp tránh spam ticket khi có nhiều instance bot chạy song song)
      const existing = await LiveMatch.findOne({ messageId: message.id });
      if (existing) return;

      // Snapshot người đang ngồi Voice lúc quăng ảnh
      let voiceSnapshot = [];
      if (message.member?.voice?.channel) {
        voiceSnapshot = message.member.voice.channel.members
          .filter(m => !m.user.bot)
          .map(m => m.id);
      }

      // Gọi Gemini AI phân tích ảnh
      const extractedData = await analyzeValorantScoreboard(attachment.url);

      // Tạo Ticket ID duy nhất
      const ticketId = `TCK-${Date.now().toString().slice(-5)}`;

      // Lưu vào DB
      const newMatch = await new LiveMatch({
        ticketId,
        channelId:       message.channel.id,
        messageId:       message.id,
        guildId:         message.guild.id,
        imageUrl:        attachment.url,
        extractedData,
        voiceSnapshot,
        selectedPlayers: voiceSnapshot
      }).save();

      // Chỉ thả reaction để báo hiệu đã nhận ảnh thành công (giữ kênh live-result sạch sẽ)
      await message.react('✅');

      // Auto-post Ticket sang #confirm-result để sếp duyệt
      await postTicketToConfirmChannel(message.guild, newMatch);

    } catch (err) {
      // Nếu trùng messageId do nhiều instance race-condition → coi như đã xử lý, không cần tạo thêm
      if (err?.code === 11000) {
        await message.react('✅').catch(() => {});
        return;
      }
      console.error('[messageCreate] Lỗi tạo Ticket:', err);
      // Thả reaction lỗi nếu có vấn đề
      await message.react('❌').catch(() => {});
    }
  }
};
