const DailyStats = require('../models/DailyStats');
const { getTodayVN } = require('../utils/dateHelper');
const { voiceSessions } = require('../utils/voiceTracker');

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState) {
    const userId   = newState.id;
    const guildId  = newState.guild.id;
    const username = newState.member?.user?.username ?? 'Unknown';

    // Bỏ qua bot
    if (newState.member?.user?.bot) return;

    const wasInVoice = oldState.channelId !== null;
    const isInVoice  = newState.channelId !== null;

    // ── User VỪA VÀO kênh Voice ───────────────────────────────────────────
    if (!wasInVoice && isInVoice) {
      voiceSessions.set(userId, { startTime: Date.now(), guildId, username });
      console.log(`🎙️  ${username} joined voice → tracker started`);
      return;
    }

    // ── User VỪA THOÁT kênh Voice ──────────────────────────────────────────
    if (wasInVoice && !isInVoice) {
      const session = voiceSessions.get(userId);
      if (!session) return; // Nếu không có trong Map thì bỏ qua

      const durationSeconds = Math.floor((Date.now() - session.startTime) / 1000);
      voiceSessions.delete(userId); // Xoá khỏi bộ nhớ tạm

      if (durationSeconds < 1) return; // Quá nhanh, không tính

      const today = getTodayVN();

      try {
        await DailyStats.findOneAndUpdate(
          { userId, guildId: session.guildId, date: today },
          {
            $inc: { voiceDuration: durationSeconds },
            $set: { username }
          },
          { upsert: true, new: true }
        );
        console.log(`🔕 ${username} rời voice → cất nốt ${durationSeconds}s cuối vào DB`);
      } catch (err) {
        if (err.code !== 11000) {
          console.error('[voiceStateUpdate] Lỗi DB:', err.message);
        }
      }
    }
  }
};
