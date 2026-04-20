const mongoose = require('mongoose');

const liveMatchSchema = new mongoose.Schema({
  ticketId:   { type: String, required: true, unique: true }, // TCK-XXXX
  channelId:  { type: String, required: true },
  messageId:  { type: String, required: true },
  imageUrl:   { type: String, required: true },

  // Dữ liệu AI bóc tách từ ảnh
  extractedData: {
    map:      { type: String, default: 'Unknown' },
    mode:     { type: String, default: 'Unknown' },
    score:    { type: String, default: 'Unknown' }, // VD: "9-13"
    result:   { type: String, default: 'Unknown' }, // VICTORY / DEFEAT / UNKNOWN
    winLose:  { type: String, default: 'UNKNOWN' }, // THẮNG / THUA / UNKNOWN
    isRanked: { type: Boolean, default: false }       // true chỉ khi là Competitive/Đấu hạng
  },

  voiceSnapshot:   [{ type: String }], // ID Discord người đang ngồi Voice lúc vợ quăng ảnh
  selectedPlayers: [{ type: String }], // Danh sách thực sự người đã chơi (sếp tổng chỉnh tay)
  mvpId:           { type: String, default: null }, // ID Discord người được phong MVP

  status:    { type: String, enum: ['PENDING', 'APPROVED', 'DECLINED'], default: 'PENDING' },
  guildId:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LiveMatch', liveMatchSchema);
