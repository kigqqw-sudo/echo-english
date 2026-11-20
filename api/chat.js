const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const MAX_AUDIO_BASE64_LENGTH = 4_000_000;

const ipBuckets = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipBuckets.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false };
  }

  entry.count += 1;

  if (ipBuckets.size > 1000) {
    for (const [key, val] of ipBuckets.entries()) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS) {
        ipBuckets.delete(key);
      }
    }
  }

  return { allowed: true };
}

const LEVEL_GUIDANCE = {
  A1: 'Beginner (A1). Use very simple words, short sentences (5-10 words), present/past simple tenses.',
  A2: 'Elementary (A2). Use everyday vocabulary and clear, short sentences.',
  B1: 'Intermediate (B1). Use natural everyday English, phrasal verbs sparingly, clear conversational flow.',
  B2: 'Upper-Intermediate (B2). Use natural idioms, varied grammar, and engaging conversational phrasing.',
  C1: 'Advanced (C1). Speak like an educated native speaker with nuanced vocabulary and natural idioms.'
};

async function callGemini(apiKey, payload) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = { error: { message: text.slice(0, 300) || `HTTP ${res.status}` } };
  }

  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'На сервере не настроен GEMINI_API_KEY.'
    });
  }

  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const clientIp = String(rawIp).split(',')[0].trim();

  if (!checkRateLimit(clientIp).allowed) {
    return res.status(429).json({
      error: 'Превышен лимит сообщений (30 в час). Попробуйте снова немного позже.'
    });
  }

  try {
    const {
      action = 'message',
      audioBase64 = '',
      mimeType = 'audio/webm',
      text = '',
      level = 'B1',
      topic = 'Свободная тема',
      history = []
    } = req.body || {};

    if (audioBase64 && audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return res.status(413).json({ error: 'Аудио слишком большое. Попробуйте записать сообщение короче 45 секунд.' });
    }

    if (action === 'message' && !audioBase64 && !String(text).trim()) {
      return res.status(400).json({ error: 'Пустое сообщение.' });
    }

    const levelDesc = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.B1;

    const systemInstruction = `
You are Echo, a friendly, concise spoken English tutor for Russian-speaking learners.
Student level: ${levelDesc}
Conversation topic: "${topic}".

Your job on every user message:
1. Transcribe accurately what the user said in English (put in "userTranscript"). If they spoke Russian or unintelligible noise, note it gently.
2. Evaluate their English for grammar, word choice, prepositions, articles, or unnatural phrasing:
   - If there is an error or a noticeably unnatural phrasing, set "hasErrors": true, write a natural corrected version in "correction", and explain the mistake briefly and clearly in Russian in "explanationRu" (1-2 short sentences, friendly tone).
   - If the phrase is correct and natural for their level, set "hasErrors": false, "correction": "", and write a short encouraging note in Russian in "explanationRu".
3. Continue the conversation naturally in English in "replyEn" (1-3 short conversational sentences suited to ${level}, ending with a light follow-up question). No markdown or emojis in "replyEn".
4. Provide an accurate, natural Russian translation of "replyEn" in "replyRu".

If starting a new conversation, set "userTranscript": "", "hasErrors": false, "correction": "", "explanationRu": "", and greet the user warmly in "replyEn" with an easy opening question on the topic "${topic}".
`.trim();

    const contents = [];
    const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

    if (action === 'start') {
      contents.push({
        role: 'user',
        parts: [{ text: `Start a new spoken English practice session on the topic "${topic}" for level ${level}.` }]
      });
    } else {
      if (safeHistory.length > 0 && safeHistory[0].role === 'model') {
        contents.push({
          role: 'user',
          parts: [{ text: `Let's practice English on the topic "${topic}".` }]
        });
      }

      for (const item of safeHistory) {
        if ((item.role === 'user' || item.role === 'model') && typeof item.text === 'string' && item.text.trim()) {
          contents.push({
            role: item.role,
            parts: [{ text: item.text.slice(0, 1000) }]
          });
        }
      }

      const userParts = [];
      if (audioBase64) {
        const cleanMime = String(mimeType).split(';')[0].trim() || 'audio/webm';
        userParts.push({
          text: 'Listen to the student audio, transcribe it, check for mistakes, and respond naturally.'
        });
        userParts.push({
          inline_data: {
            mime_type: cleanMime,
            data: audioBase64
          }
        });
      } else {
        userParts.push({
          text: `Student message: "${String(text).trim().slice(0, 1000)}". Check for mistakes and respond naturally.`
        });
      }

      contents.push({ role: 'user', parts: userParts });
    }

    const baseGenerationConfig = {
      temperature: 0.7,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          userTranscript: { type: 'STRING' },
          hasErrors: { type: 'BOOLEAN' },
          correction: { type: 'STRING' },
          explanationRu: { type: 'STRING' },
          replyEn: { type: 'STRING' },
          replyRu: { type: 'STRING' }
        },
        required: ['userTranscript', 'hasErrors', 'correction', 'explanationRu', 'replyEn', 'replyRu']
      }
    };

    const buildPayload = (thinkingConfig) => ({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: thinkingConfig
        ? { ...baseGenerationConfig, thinkingConfig }
        : baseGenerationConfig
    });

    // Пробуем отключить долгое размышление, чтобы ответ приходил за 1-2 секунды
    let result = await callGemini(apiKey, buildPayload({ thinkingBudget: 0 }));

    if (!result.ok && result.status === 400 && /thinking/i.test(result.data?.error?.message || '')) {
      result = await callGemini(apiKey, buildPayload({ thinkingLevel: 'minimal' }));
    }

    if (!result.ok && result.status === 400 && /thinking/i.test(result.data?.error?.message || '')) {
      result = await callGemini(apiKey, buildPayload(null));
    }

    if (!result.ok) {
      const apiErr = result.data?.error?.message || `Ошибка Gemini API (${result.status}).`;
      return res.status(result.status).json({ error: apiErr });
    }

    const rawText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: 'ИИ вернул пустой ответ. Попробуйте ещё раз.' });
    }

    const parsed = JSON.parse(rawText);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Ошибка сервера: ' + (err?.message || 'попробуйте ещё раз.') });
  }
}
