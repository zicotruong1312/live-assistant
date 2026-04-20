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
      } else {
        // Dự phòng: Nếu người post ảnh không ở trong voice, lấy tất cả mọi người đang online trong các phòng voice
        voiceSnapshot = Array.from(
            message.guild.voiceStates.cache.filter(vs => vs.channelId && vs.member && !vs.member.user.bot).keys()
        );
      }

      // Tạo Ticket ID duy nhất
      const ticketId = `TCK-${Date.now().toString().slice(-5)}`;

      // Sử dụng findOneAndUpdate với $setOnInsert để tạo khóa giả (Atomic Lock) chống Race Condition
      // Kể cả khi MongoDB bị thiếu Unique Index, thao tác này vẫn đảm bảo chỉ có 1 instance tạo được dữ liệu
      const lock = await LiveMatch.findOneAndUpdate(
        { messageId: message.id },
        {
          $setOnInsert: {
            ticketId,
            channelId:       message.channel.id,
            guildId:         message.guild.id,
            imageUrl:        attachment.url,
            voiceSnapshot,
            selectedPlayers: voiceSnapshot,
            status: 'PENDING'
          }
        },
        { upsert: true, new: false } // Trả về document TRƯỚC KHI xử lý
      );

      // Nếu 'lock' trả về một Object, nghĩa là Document này ĐÃ TỒN TẠI (do 1 instance khác vừa tạo xong phần nghìn giây trước)
      if (lock) return;

      // Chỉ reaction khi chắc chắn instance này giành được quyền xử lý
      await message.react('👀').catch(() => {});

      // Sau khi lấy được quyền, gọi Gemini AI phân tích ảnh
      const extractedData = await analyzeValorantScoreboard(attachment.url);

      // Cập nhật lại data thật từ AI
      const completedMatch = await LiveMatch.findOneAndUpdate(
        { messageId: message.id },
        { $set: { extractedData } },
        { new: true }
      );

      // Reaction báo hiệu hoàn tất AI
      await message.reactions.removeAll().catch(() => {});
      await message.react('✅').catch(() => {});

      // Auto-post Ticket sang #confirm-result để sếp duyệt
      await postTicketToConfirmChannel(message.guild, completedMatch);

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
