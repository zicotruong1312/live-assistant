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
    // Đổi sang 'gemini-1.5-flash-latest' để tránh lỗi 404 trên endpoint v1beta
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash-latest',
      generationConfig: { responseMimeType: "application/json" }
    });

    // ... (Tải ảnh base64 giữ nguyên) ...
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
    const imagePart = {
      inlineData: {
        data: Buffer.from(imgResponse.data).toString('base64'), mimeType
      }
    };

    const prompt = `You are a Valorant scoreboard analyzer. Analyze the provided image and return a JSON object.
The game client language might be English or Vietnamese.

Fields to extract:
1. "map": The map name (e.g., Ascent, Bind, Haven, Split, Icebox, Breeze, Fracture, Pearl, Lotus, Sunset, Abyss). It is usually at the top left after "MAP -" or "BẢN ĐỒ -".
2. "mode": The game mode (e.g., Competitive, Unrated, Deathmatch, Swiftplay). Usually below the map name. If in Vietnamese (e.g., "Đấu Hạng"), translate to English "Competitive".
3. "result": The match result. 
   - If you see "VICTORY", "CHIẾN THẮNG", or "THẮNG" -> "VICTORY"
   - If you see "DEFEAT", "THẤT BẠI", or "THUA" -> "DEFEAT"
   - Otherwise -> "UNKNOWN"
4. "isRanked": Boolean. true if mode is Competitive/Đấu Hạng, false otherwise.

Strict JSON format:
{"map": "string", "mode": "string", "result": "VICTORY|DEFEAT|UNKNOWN", "isRanked": boolean}`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const raw = response.text().trim();
    console.log(`[GeminiVision] Raw AI Response: ${raw}`);

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      console.error('[GeminiVision] ❌ JSON Parse Error:', parseErr.message);
      // Fallback: Try regex extraction if JSON mode fails for some reason
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI returned invalid JSON format');
      }
    }

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
