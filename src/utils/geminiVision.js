const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const KNOWN_MAPS = [
  'Ascent',
  'Bind',
  'Haven',
  'Split',
  'Icebox',
  'Breeze',
  'Fracture',
  'Pearl',
  'Lotus',
  'Sunset',
  'Abyss'
];

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
  'competitive', 'đấu hạng', 'cạnh tranh', 'xếp hạng', 'danh vọng', 'danh vong'
];

function stripDiacritics(input) {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeResult(rawResult) {
  const s = stripDiacritics(String(rawResult || '')).toLowerCase();

  // Covers: victory/defeat, win/lose and Vietnamese equivalents (with/without accents, any casing)
  if (/(^|[^a-z])(victory|win|chien thang|thang)([^a-z]|$)/i.test(s)) return 'VICTORY';
  if (/(^|[^a-z])(defeat|lose|that bai|thua)([^a-z]|$)/i.test(s)) return 'DEFEAT';
  return 'UNKNOWN';
}

function normalizeMap(rawMap) {
  const original = String(rawMap || '').trim();
  if (!original) return 'Unknown';

  // Remove common prefixes from OCR/AI outputs
  const cleaned = original
    .replace(/^(map|ban do|bản đồ)\s*[-:–—]\s*/i, '')
    .replace(/[\[\]\(\)\{\}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanedNorm = stripDiacritics(cleaned).toLowerCase();
  const match = KNOWN_MAPS.find(m => cleanedNorm.includes(m.toLowerCase()));
  return match || cleaned || 'Unknown';
}

function normalizeMode(rawMode) {
  const original = String(rawMode || '').trim();
  if (!original) return 'Unknown';

  const s = stripDiacritics(original).toLowerCase();

  // Canonicalize common Vietnamese -> English for consistency in UI and isRanked detection
  if (s.includes('dau hang') || s.includes('xep hang') || s.includes('canh tranh') || s.includes('danh vong')) return 'Competitive';
  if (s.includes('dau thuong') || s.includes('standard') || s.includes('unrated')) return 'Unrated';
  if (s.includes('sinh tu doi')) return 'Team Deathmatch';
  if (s.includes('sinh tu') || s.includes('deathmatch')) return 'Deathmatch';
  if (s.includes('spike rush')) return 'Spike Rush';
  if (s.includes('swiftplay')) return 'Swiftplay';
  if (s.includes('nhan ban') || s.includes('replication')) return 'Replication';
  if (s.includes('leo thang') || s.includes('escalation')) return 'Escalation';
  if (s.includes('tuy chinh') || s.includes('custom')) return 'Custom';

  return original;
}

function normalizeScore(rawScore) {
  const s = String(rawScore || '').trim();
  if (!s) return 'Unknown';

  // Accept: 9-13, 9 : 13, 9–13, 9—13, 9/13
  const m = s.match(/(\d{1,2})\s*[-–—:\/]\s*(\d{1,2})/);
  if (!m) return s;
  return `${Number(m[1])}-${Number(m[2])}`;
}

/**
 * Gọi Gemini Vision API để phân tích ảnh bảng điểm Valorant
 * @param {string} imageUrl - URL ảnh cần phân tích
 * @returns {{ map: string, mode: string, result: string, winLose: string, score: string, isRanked: boolean }}
 */
async function analyzeValorantScoreboard(imageUrl) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[GeminiVision] ⚠️ Thiếu GEMINI_API_KEY, bỏ qua phân tích ảnh.');
      return { map: 'Unknown', mode: 'Unknown', result: 'UNKNOWN', winLose: 'UNKNOWN', score: 'Unknown', isRanked: false };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Đổi sang 'gemini-1.5-flash-latest' để tránh lỗi 404 trên endpoint v1beta
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro',
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

    const basePrompt = `You are a Valorant scoreboard OCR specialist. Analyze the provided image and return a structured JSON object.
The game client language might be English or Vietnamese.

Fields to extract:
1. "map": The map name (e.g., Ascent, Bind, Haven, Split, Icebox, Breeze, Fracture, Pearl, Lotus, Sunset, Abyss). It is usually at the top left after "MAP -" or "BẢN ĐỒ -".
2. "mode": The game mode (e.g., Competitive, Unrated, Deathmatch, Swiftplay). Usually below the map name. Use the exact text you see, e.g., "Đấu Hạng", "Danh Vọng", "Competitive".
3. "result": The match result. Look at the TOP-CENTER of the image.
   - If you see "VICTORY", "CHIẾN THẮNG", or "THẮNG" -> "VICTORY"
   - If you see "DEFEAT", "THẤT BẠI", or "THUA" -> "DEFEAT"
   - Otherwise -> "UNKNOWN"
4. "score": The final rounds score as "team1-team2" (example: "9-13"). It is typically displayed near the result text at the top center.
5. "mvp": The in-game name of the MVP. Look at the scoreboard table. The MVP is the player at the very top of the list for the winning team, or the player with a star icon/highest combat score. Return their exact in-game name.
6. "isRanked": Boolean. true if mode is Competitive/Đấu Hạng/Danh Vọng, false otherwise.

Strict JSON format:
{"map": "string", "mode": "string", "result": "VICTORY|DEFEAT|UNKNOWN", "score": "string", "mvp": "string", "isRanked": boolean}`;

    async function runPrompt(promptText, label) {
      const result = await model.generateContent([promptText, imagePart]);
      const response = await result.response;
      const raw = response.text().trim();
      console.log(`[GeminiVision] Raw AI Response (${label}): ${raw}`);

      try {
        return JSON.parse(raw);
      } catch (parseErr) {
        console.error(`[GeminiVision] ❌ JSON Parse Error (${label}):`, parseErr.message);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        throw new Error('AI returned invalid JSON format');
      }
    }

    function postNormalize(data) {
      const out = { ...(data || {}) };

      out.map = normalizeMap(out.map);
      out.mode = normalizeMode(out.mode);
      out.result = normalizeResult(out.result);
      out.score = normalizeScore(out.score);
      out.mvp = String(out.mvp || 'Unknown').trim();
      out.winLose = out.result === 'VICTORY' ? 'THẮNG' : out.result === 'DEFEAT' ? 'THUA' : 'UNKNOWN';

      // Coerce isRanked to boolean if model returns string/number
      if (typeof out.isRanked !== 'boolean') {
        const v = String(out.isRanked || '').trim().toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') out.isRanked = true;
        else if (v === 'false' || v === '0' || v === 'no') out.isRanked = false;
      }

      const modeLower = stripDiacritics(out.mode || '').toLowerCase();
      if (RANKED_MODES.some(m => modeLower.includes(m))) out.isRanked = true;
      else if (NON_RANKED_MODES.some(m => modeLower.includes(m))) out.isRanked = false;
      else if (typeof out.isRanked !== 'boolean') out.isRanked = false;

      return out;
    }

    function isMostlyUnknown(d) {
      const mapUnknown = !d?.map || String(d.map).toLowerCase() === 'unknown';
      const modeUnknown = !d?.mode || String(d.mode).toLowerCase() === 'unknown';
      const resUnknown = !d?.result || String(d.result).toUpperCase() === 'UNKNOWN';
      const scoreUnknown = !d?.score || String(d.score).toLowerCase() === 'unknown';
      const mvpUnknown = !d?.mvp || String(d.mvp).toLowerCase() === 'unknown';
      // If 3 out of 5 are unknown, consider it mostly unknown
      let scoreParams = 0;
      if (mapUnknown) scoreParams++;
      if (modeUnknown) scoreParams++;
      if (resUnknown) scoreParams++;
      if (scoreUnknown) scoreParams++;
      if (mvpUnknown) scoreParams++;
      return scoreParams >= 3;
    }

    let data = postNormalize(await runPrompt(basePrompt, 'base'));

    // Double-check isRanked dựa trên danh sách cứng để tránh AI ảo
    if (isMostlyUnknown(data)) {
      const hardPrompt = `You are a Valorant scoreboard OCR specialist.
Focus deeply on text extraction.

Top-left usually contains the game mode and map:
- Vietnamese: "DANH VỌNG", "ĐẤU HẠNG", "BẢN ĐỒ - SPLIT"
- English: "COMPETITIVE", "MAP - SPLIT"

Top-center usually contains result and score:
- Vietnamese: "<number> THẤT BẠI <number>" or "<number> CHIẾN THẮNG <number>"
- English: "<number> DEFEAT <number>" or "<number> VICTORY <number>"

Scoreboard body:
- The top players of each team. The player with the star is the MVP. Also look at the first row under "ĐỘI BẠN" or your team depending on who won.

Rules:
- "map": MUST be one of ${KNOWN_MAPS.join(', ')}. Look for it in the top left corner.
- "mode": Read the text above the map in the top left corner (e.g. Competitive, Đấu Hạng).
- "result": VICTORY or DEFEAT based on the center text.
- "score": Look at the numbers directly left and right of the result text (e.g. 13-9).
- "mvp": The exact in-game name of the MVP from the scoreboard list (usually the top player of the top team).
- "isRanked": true if mode contains Competitive/Danh Vọng/Đấu Hạng.

Return STRICT JSON only:
{"map":"string","mode":"string","result":"VICTORY|DEFEAT|UNKNOWN","score":"string","mvp":"string","isRanked":boolean}`;

      data = postNormalize(await runPrompt(hardPrompt, 'retry'));
    }

    console.log(`[GeminiVision] ✅ Phân tích xong: Map=${data.map}, Mode=${data.mode}, Result=${data.result}, Score=${data.score}, MVP=${data.mvp}, isRanked=${data.isRanked}`);
    return data;

  } catch (err) {
    console.error('[GeminiVision] ❌ Lỗi khi phân tích ảnh:', err.message);
    return { map: 'Error', mode: 'Error', result: 'UNKNOWN', winLose: 'UNKNOWN', score: 'Unknown', mvp: 'Unknown', isRanked: false };
  }
}

module.exports = { analyzeValorantScoreboard };
