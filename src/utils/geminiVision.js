const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Danh sách chế độ KHÔNG được tính điểm (cả tên Tiếng Anh và Tiếng Việt)
const NON_RANKED_MODES = [
  'standard', 'unrated', 'đấu thường', 'chơi tự do',
  'custom', 'chế độ tùy chỉnh', 'chơi tùy chỉnh',
  'deathmatch', 'sinh tử',
  'team deathmatch', 'sinh tử đội',
  'escalation', 'leo thang',
  'spike rush', 'spike rush',
  'replication', 'nhân bản',
  'swiftplay'
];

// Danh sách chế độ ĐƯỢC tính điểm
const RANKED_MODES = [
  'competitive', 'đấu hạng', 'cạnh tranh', 'xếp hạng'
];

/**
 * Gọi Gemini Vision API để phân tích ảnh bảng điểm Valorant
 * @param {string} imageUrl - URL ảnh cần phân tích
 * @returns {{ map: string, mode: string, result: string, isRanked: boolean }}
 */
async function analyzeValorantScoreboard(imageUrl) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[GeminiVision] ⚠️ Thiếu GEMINI_API_KEY, bỏ qua phân tích ảnh.');
      return { map: 'Unknown', mode: 'Unknown', result: 'Unknown', isRanked: false };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Tải ảnh về dạng base64
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
    const imagePart = {
      inlineData: {
        data: Buffer.from(imgResponse.data).toString('base64'),
        mimeType
      }
    };

    const prompt = `Bạn là AI chuyên phân tích màn hình kết quả trận Valorant.
Hãy đọc các thông tin sau từ bức ảnh và chỉ trả về một JSON object thuần túy (KHÔNG dùng markdown, KHÔNG dùng \`\`\`json):

1. "map": Tên map (thường ở góc trên bên trái, dạng "MAP - <Tên Map>"). Chỉ lấy tên, không lấy "MAP -".
2. "mode": Chế độ chơi (thường nằm ngay dưới tên map, ví dụ: "Standard", "Competitive", "Custom", "Deathmatch"). Giữ nguyên tên tiếng Anh nếu có.
3. "result": Kết quả trận. Đọc chữ to ở giữa màn hình: VICTORY hoặc DEFEAT. Trả về đúng một trong hai từ này (viết hoa), hoặc "UNKNOWN" nếu không rõ.
4. "isRanked": Boolean. Trả về true CHỈ khi mode là "Competitive" hoặc các tên tiếng Việt tương đương như "Đấu hạng", "Cạnh tranh", "Xếp hạng". Tất cả chế độ khác (Standard, Custom, Deathmatch, Unrated, v.v.) đều trả về false.

Định dạng JSON yêu cầu:
{"map":"<TênMap>","mode":"<ChếĐộChơi>","result":"<VICTORY|DEFEAT|UNKNOWN>","isRanked":<true|false>}`;

    const result = await model.generateContent([prompt, imagePart]);
    const raw = result.response.text().trim();

    // Loại bỏ markdown nếu AI không tuân thủ
    const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/gi, '').trim();
    const data = JSON.parse(cleaned);

    // Double-check isRanked dựa trên danh sách cứng để tránh AI ảo
    const modeLower = (data.mode || '').toLowerCase();
    if (RANKED_MODES.some(m => modeLower.includes(m))) {
      data.isRanked = true;
    } else if (NON_RANKED_MODES.some(m => modeLower.includes(m))) {
      data.isRanked = false;
    }

    console.log(`[GeminiVision] ✅ Phân tích xong: Map=${data.map}, Mode=${data.mode}, Result=${data.result}, isRanked=${data.isRanked}`);
    return data;

  } catch (err) {
    console.error('[GeminiVision] ❌ Lỗi khi phân tích ảnh:', err.message);
    return { map: 'Error', mode: 'Error', result: 'Error', isRanked: false };
  }
}

module.exports = { analyzeValorantScoreboard };
