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

    const prompt = `Bạn là một chuyên gia phân tích hình ảnh bảng điểm game Valorant.
Hãy đọc các thông tin từ bức ảnh này. Lưu ý: Client game có thể đang dùng TIẾNG VIỆT hoặc TIẾNG ANH.

Các quy tắc trích xuất:
1. "map": Tên bản đồ. Nếu tiếng Việt ghi "BẢN ĐỒ - TÊN", hãy chỉ lấy "Tên". Các map phổ biến: Ascent, Bind, Haven, Split, Icebox, Breeze, Fracture, Pearl, Lotus, Sunset, Abyss.
2. "mode": Chế độ chơi. (Ví dụ: Competitive, Đấu Hạng, Unrated, Đấu Thường, Deathmatch, Sinh Tử, Custom, Tùy Chỉnh). Hãy ưu tiên trả về tên TIẾNG ANH chuẩn (ví dụ: Competitive thay vì Đấu hạng).
3. "result": Kết quả trận đấu. 
   - Nếu thấy: VICTORY, CHIẾN THẮNG, THẮNG -> Trả về "VICTORY"
   - Nếu thấy: DEFEAT, THẤT BẠI, THUA -> Trả về "DEFEAT"
   - Nếu không rõ -> Trả về "UNKNOWN"
4. "isRanked": Boolean. Trả về true nếu chế độ là Competitive/Đấu Hạng. Các chế độ khác là false.

YÊU CẦU QUAN TRỌNG: Chỉ trả về mã JSON thuần túy, không có định dạng markdown.

Định dạng JSON:
{"map": "tên_map", "mode": "tên_mode", "result": "VICTORY/DEFEAT/UNKNOWN", "isRanked": true/false}`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const raw = response.text().trim();
    console.log(`[GeminiVision] Raw AI Response: ${raw}`);

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
