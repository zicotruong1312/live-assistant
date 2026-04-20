const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    console.log('🔌 Đang kết nối MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000
    });
    isConnected = true;
    console.log('✅ Đã kết nối MongoDB Atlas thành công!');
  } catch (err) {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
