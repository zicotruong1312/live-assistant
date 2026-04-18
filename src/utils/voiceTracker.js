const DailyStats = require('../models/DailyStats');
const { getTodayVN } = require('./dateHelper');

// In-memory map: userId → { startTime, guildId, username }
const voiceSessions = new Map();

/**
 * Đồng bộ thời gian Voice đang đếm vào Database mỗi 1 phút
 * Giúp hiển thị Bảng xếp hạng Real-time ngay cả khi user chưa thoát Voice
 */
async function syncVoiceToDB() {
  if (voiceSessions.size === 0) return;
  
  const now = Date.now();
  const today = getTodayVN();
  const bulkOps = [];

  for (const [userId, session] of voiceSessions.entries()) {
    const durationSeconds = Math.floor((now - session.startTime) / 1000);
    
    // Chỉ đồng bộ gom block nếu đã ngồi >= 1 phút
    if (durationSeconds >= 60) {
      bulkOps.push({
        updateOne: {
          filter: { userId, guildId: session.guildId, date: today },
          update: { 
            $inc: { voiceDuration: durationSeconds },
            $set: { username: session.username }
          },
          upsert: true
        }
      });

      // Reset lại mốc thời gian để đếm tiếp cho phút sau
      session.startTime = now;
    }
  }

  if (bulkOps.length > 0) {
    try {
      await DailyStats.bulkWrite(bulkOps);
    } catch (err) {
      console.error('[syncVoiceToDB Lỗi]', err.message);
    }
  }
}

/**
 * Gọi hàm này lúc Bot Ready để quét lại những ai đang trong Voice 
 * (Tránh việc bot khởi động lại bị lỡ nhịp)
 */
function scanActiveVoices(client) {
  let count = 0;
  client.guilds.cache.forEach(guild => {
    guild.voiceStates.cache.forEach(voiceState => {
      // Nếu đang trong kênh voice và không phải bot
      if (voiceState.channelId && !voiceState.member.user.bot) {
        voiceSessions.set(voiceState.id, {
          startTime: Date.now(),
          guildId: guild.id,
          username: voiceState.member.user.username
        });
        count++;
      }
    });
  });
  console.log(`🎙️ [Scan] Đã đưa ${count} ae đang ngồi trong Voice vào bộ đếm thời gian thực!`);
}

/**
 * Khởi động vòng lặp đồng bộ Database
 */
function startVoiceSyncLoop() {
  // Sync mỗi 1 phút (60,000 ms)
  setInterval(syncVoiceToDB, 60 * 1000);
  console.log('🔄 Đã kích hoạt cơ chế lưu Voice Real-time (Auto-sync mỗi phút).');
}

module.exports = { 
  voiceSessions, 
  scanActiveVoices, 
  startVoiceSyncLoop 
};
