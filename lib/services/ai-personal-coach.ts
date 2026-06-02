// AI Personal Coach — system prompts theo role + LLM call.
// Hỗ trợ Anthropic (Claude) hoặc OpenAI. Cần env ANTHROPIC_API_KEY hoặc OPENAI_API_KEY.
// Nếu chưa cấu hình → trả lời "demo" với gợi ý setup.
//
// PRIVACY: không gửi PII (tên user / email / org) trong system prompt — chỉ role tổng quát.

import 'server-only';

export type CoachCategory = 'work' | 'life' | 'learning' | 'strategy';

interface RolePromptMap {
  base: string;
  /** Override cho từng category nếu cần */
  byCategory?: Partial<Record<CoachCategory, string>>;
}

const SAFETY_GUIDELINES = `
QUY TẮC BẮT BUỘC:
- Trả lời bằng tiếng Việt, súc tích, chuyên nghiệp.
- KHÔNG đưa lời khuyên y tế cụ thể, pháp lý chi tiết, hay tài chính rủi ro cao — luôn khuyên gặp chuyên gia.
- KHÔNG phán xét tính cách người dùng, KHÔNG cực đoan.
- Khi gợi ý hành động: liệt kê 3-5 bước CỤ THỂ, có thể làm được trong tuần này.
- Khi giải đáp: ngắn gọn (≤ 250 từ), kèm checklist nếu phù hợp.
- Tôn trọng quyền riêng tư người dùng. Không hỏi thông tin nhạy cảm không cần thiết.
`.trim();

const ROLE_PROMPTS: Record<string, RolePromptMap> = {
  CEO: {
    base: 'Bạn là cố vấn cá nhân của một CEO/Chủ đầu tư chuỗi bể bơi - thể thao. Tập trung: tư duy chiến lược, kiểm soát hệ thống đa cơ sở, mô hình tăng trưởng, quản trị tài chính cấp cao, tối ưu bộ máy. Phong cách: định hướng dài hạn, dựa trên nguyên lý quản trị (5 forces, OKR, principles của Ray Dalio).',
    byCategory: {
      strategy: 'Tập trung trả lời theo khung chiến lược: phân tích tình huống → các lựa chọn → trade-off → khuyến nghị → checklist hành động tuần này.',
      life: 'Tư vấn cân bằng đời sống của lãnh đạo cấp cao: quản lý năng lượng, gia đình, sức khoẻ.',
    },
  },
  ADMIN: {
    base: 'Bạn là trợ lý cá nhân của Tổng Giám đốc điều hành. Tập trung: điều hành doanh nghiệp, KPI tổng, hiệu suất hệ thống, kiểm soát vận hành, quản trị nhân sự cấp cao, tăng doanh thu, tối ưu quản lý.',
  },
  GD_KD: {
    base: 'Bạn là cố vấn của Giám đốc Khối Kinh doanh (5 cơ sở bể bơi-thể thao). Tập trung: quản lý mục tiêu khối, theo dõi tiến độ, tối ưu quy trình kinh doanh, kiểm soát chất lượng, báo cáo vận hành.',
  },
  GD_VP: {
    base: 'Bạn là cố vấn của Giám đốc Khối Văn phòng. Tập trung: quản trị backoffice, KPI khối VP, tối ưu quy trình hỗ trợ, quản lý nhân sự văn phòng.',
  },
  TP_KT: {
    base: 'Bạn là cố vấn của Trưởng phòng Kỹ thuật (vận hành máy lọc, nhiệt, hoá chất). Tập trung: lập kế hoạch bảo dưỡng, quản lý KPI kỹ thuật, deadline, hiệu suất bản thân.',
  },
  PP_HT: {
    base: 'Bạn là cố vấn của Phó phòng Kỹ thuật Hệ thống. Tập trung: quản trị công việc cá nhân, lập kế hoạch bảo dưỡng máy, theo dõi KPI vận hành.',
  },
  PP_XLN: {
    base: 'Bạn là cố vấn của Phó phòng Kỹ thuật Xử lý nước. Tập trung: chất lượng nước, hoá chất xử lý, KPI vận hành.',
  },
};
// QLCS, TP, PP-general fallback
const QLCS_PROMPT: RolePromptMap = {
  base: 'Bạn là cố vấn của Quản lý Cơ sở bể bơi-thể thao. Tập trung: điều hành cơ sở, kiểm soát checklist hằng ngày, xử lý sự cố, quản lý nhân sự ca, tăng doanh thu cơ sở, giảm lỗi vận hành.',
};
const TP_GENERIC_PROMPT: RolePromptMap = {
  base: 'Bạn là cố vấn của Trưởng phòng. Tập trung: quản trị công việc cá nhân, lập kế hoạch, theo dõi KPI, quản lý deadline, tăng hiệu suất bản thân.',
};
const PP_GENERIC_PROMPT: RolePromptMap = {
  base: 'Bạn là cố vấn của Phó phòng. Tập trung: quản trị công việc cá nhân, lập kế hoạch, theo dõi KPI, quản lý deadline, tăng hiệu suất bản thân.',
};

const CATEGORY_HINTS: Record<CoachCategory, string> = {
  work:     '\nChủ đề: CÔNG VIỆC. Hỗ trợ ra quyết định, lập kế hoạch, ưu tiên, deadline.',
  life:     '\nChủ đề: ĐỜI SỐNG. Hỗ trợ quản lý thời gian, năng lượng, cân bằng, thói quen, phát triển bản thân. KHÔNG đưa lời khuyên y tế cụ thể.',
  learning: '\nChủ đề: HỌC TẬP. Gợi ý kỹ năng cần học theo vai trò, lộ trình học, sách/khoá học, milestone học tập.',
  strategy: '\nChủ đề: CHIẾN LƯỢC. Tư vấn dài hạn, mô hình kinh doanh, định hướng.',
};

export function buildSystemPrompt(roleCode: string, category: CoachCategory): string {
  let r: RolePromptMap;
  if (ROLE_PROMPTS[roleCode]) r = ROLE_PROMPTS[roleCode];
  else if (roleCode.startsWith('QLCS_')) r = QLCS_PROMPT;
  else if (roleCode.startsWith('TP_')) r = TP_GENERIC_PROMPT;
  else if (roleCode === 'PP_HT' || roleCode === 'PP_XLN' || roleCode.startsWith('PP_')) r = PP_GENERIC_PROMPT;
  else r = { base: 'Bạn là trợ lý cá nhân giúp người dùng quản lý công việc và phát triển bản thân.' };

  const catOverride = r.byCategory?.[category];
  const parts = [r.base, catOverride ?? CATEGORY_HINTS[category], SAFETY_GUIDELINES];
  return parts.filter(Boolean).join('\n\n');
}

// ════════════ LLM Call ════════════

export type LLMProvider = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'fallback';
export interface LLMResult {
  answer: string;
  provider: LLMProvider;
}

/** Chọn provider theo env (chỉ định bằng AI_PROVIDER hoặc auto-detect theo key có sẵn).
 *  Thứ tự auto-detect: Claude (tốt nhất) → Gemini (free) → Groq (free, nhanh) → OpenAI → fallback */
export async function askLLM(systemPrompt: string, userMessage: string): Promise<LLMResult> {
  const explicit = (process.env.AI_PROVIDER ?? '').toLowerCase().trim();
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const groq = process.env.GROQ_API_KEY;

  // Explicit override (vd. AI_PROVIDER=gemini)
  if (explicit === 'anthropic' && anthropic) return askAnthropic(systemPrompt, userMessage, anthropic);
  if (explicit === 'gemini' && gemini) return askGemini(systemPrompt, userMessage, gemini);
  if (explicit === 'groq' && groq) return askGroq(systemPrompt, userMessage, groq);
  if (explicit === 'openai' && openai) return askOpenAI(systemPrompt, userMessage, openai);

  // Auto-detect (ưu tiên Claude > Gemini > Groq > OpenAI)
  if (anthropic) return askAnthropic(systemPrompt, userMessage, anthropic);
  if (gemini)    return askGemini(systemPrompt, userMessage, gemini);
  if (groq)      return askGroq(systemPrompt, userMessage, groq);
  if (openai)    return askOpenAI(systemPrompt, userMessage, openai);

  return {
    answer: '⚙️ **AI chưa được cấu hình**\n\nADMIN cần thêm 1 trong các API key sau vào `.env.local`:\n\n**🆓 Miễn phí (đề xuất):**\n```\nGEMINI_API_KEY=...    # 1500 req/ngày FREE, vĩnh viễn\n# hoặc\nGROQ_API_KEY=...      # 6000 token/ngày FREE, siêu nhanh\n```\n\n**💎 Trả phí (chất lượng cao nhất):**\n```\nANTHROPIC_API_KEY=sk-ant-...    # Claude Sonnet 4.6\n```\n\nLấy key tại:\n• Gemini: https://aistudio.google.com/apikey\n• Groq: https://console.groq.com/keys\n• Claude: https://console.anthropic.com/settings/keys\n\nSau khi thêm → restart server (`npm run dev`).\n\n---\n\nCâu hỏi của bạn đã được ghi nhận:\n\n> ' + userMessage.slice(0, 300),
    provider: 'fallback',
  };
}

async function askAnthropic(system: string, userMsg: string, apiKey: string): Promise<LLMResult> {
  // Model có thể override qua env ANTHROPIC_MODEL (vd. 'claude-opus-4-7' cho câu hỏi chiến lược).
  // Default Sonnet 4.6 — cân bằng tốt giữa chất lượng và chi phí.
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: userMsg.slice(0, 5000) }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const text = Array.isArray(json?.content) && json.content[0]?.text ? json.content[0].text : '(phản hồi rỗng)';
  return { answer: text, provider: 'anthropic' };
}

async function askGemini(system: string, userMsg: string, apiKey: string): Promise<LLMResult> {
  // Default: gemini-flash-latest (stable alias, free tier: 1500 req/day).
  // Override: GEMINI_MODEL=gemini-2.5-flash (mới hơn) hoặc gemini-3-flash-preview (chất lượng cao).
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMsg.slice(0, 5000) }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
      safetySettings: [
        // Để model không từ chối tư vấn thường — cho phép medium harassment/sexual/hate threshold.
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(phản hồi rỗng)';
  return { answer: text, provider: 'gemini' };
}

async function askGroq(system: string, userMsg: string, apiKey: string): Promise<LLMResult> {
  // Groq dùng OpenAI-compatible API + Llama 3.3 70B (free, ~500 tok/s).
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg.slice(0, 5000) },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? '(phản hồi rỗng)';
  return { answer: text, provider: 'groq' };
}

async function askOpenAI(system: string, userMsg: string, apiKey: string): Promise<LLMResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg.slice(0, 5000) },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenAI API ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? '(phản hồi rỗng)';
  return { answer: text, provider: 'openai' };
}
