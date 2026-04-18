const mongoose = require('mongoose');

const userLiveStatsSchema = new mongoose.Schema({
  userId:         { type: String, required: true },
  guildId:        { type: String, required: true },
  totalPoints:    { type: Number, default: 0 }, // Điểm thực chiến (cộng dồn vĩnh viễn)
  matchesPlayed:  { type: Number, default: 0 }, // Tổng số trận đã chơi cùng
  matchesWon:     { type: Number, default: 0 }, // Số trận thắng
  matchesLost:    { type: Number, default: 0 }, // Số trận thua
  mvpCount:       { type: Number, default: 0 }  // Số lần được phong MVP
});

userLiveStatsSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('UserLiveStats', userLiveStatsSchema);
