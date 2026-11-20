const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 час
const RATE_LIMIT_MAX_REQUESTS = 30; // максимум запросов в час с одного IP
const MAX_AUDIO_BASE64_LENGTH = 4_000_000; // ~3 МБ аудио

// Базовый in-memory лимитер (защита от случайного спама в рамках инстанса)
const ipBuckets = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipBuckets.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;

  // Периодическая очистка старых записей
  if (ipBuckets.size > 1000) {
    for (const [key, val] of ipBuckets.entries()) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS) {
        ipBuckets.delete(key);
      }
    }
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

const LEVEL_GUIDANCE = {
  A1: 'Beginner (A1). Use very simple words, short sentences (5-10 words), present/past simple tenses.',
  A2: 'Elementary (A2). Use everyday vocabulary and clear, short sentences.',
  B1: 'Intermediate (B1). Use natural everyday English, phrasal verbs sparingly, clear conversational flow.',
  B2: 'Upper-Intermediate (B2). Use natural idioms, varied grammar, and engaging conversational phrasing.',
  C1: 'Advanced (C1). Speak like an educated native speaker with nuanced vocabulary and natural idioms.'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'На сервере не настроен GEMINI_API_KEY. Добавьте его в Environment Variables на Vercel.'
    });
  }

  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const clientIp = String(rawIp).split(',')[0].trim();
  const rateCheck = checkRateLimit(clientIp);

  if (!rateCheck.allowed) {
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
   - If there is an error or a noticeably unnatural phrasing, set "hasErrors": true, write a natural corrected version in "correction", and explain the mistake briefly and clearly in Russian in "explanationRu" (1-2 short sentences, friendly tone, no lecturing).
   - If the phrase is correct and natural for their level, set "hasErrors": false, "correction": "", and write a short encouraging note in Russian in "explanationRu" (e.g. "Отлично, звучит естественно!").
3. Continue the conversation naturally in English in "replyEn" (1-3 short conversational sentences suited to ${level}, ending with a light follow-up question to keep them talking). Do not include markdown or emojis in "replyEn" because it will be read aloud via TTS.
4. Provide an accurate, natural Russian translation of "replyEn" in "replyRu".

If the action is starting a new conversation, set "userTranscript": "", "hasErrors": false, "correction": "", "explanationRu": "", and greet the user warmly in "replyEn" with an easy opening question on the topic "${topic}".
`.trim();

    // Формируем историю диалога (максимум последние 12 реплик)
    const contents = [];
    const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

    if (action === 'start') {
      contents.push({
        role: 'user',
        parts: [{ text: `Start a new spoken English practice session on the topic "${topic}" for level ${level}.` }]
      });
    } else {
      // Gemini требует, чтобы диалог начинался с роли user
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
        // Убираем суффикс ;codecs=... для совместимости с Gemini API
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
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
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const apiErr = data?.error?.message || 'Ошибка ответа от Gemini API.';
      return res.status(geminiRes.status).json({ error: apiErr });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: 'ИИ вернул пустой ответ. Попробуйте сказать фразу ещё раз.' });
    }

    const parsed = JSON.parse(rawText);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Не удалось обработать запрос. Попробуйте ещё раз.' });
  }
}
