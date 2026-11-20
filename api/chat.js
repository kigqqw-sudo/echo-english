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

const STARTERS = {
  'Свободная тема': {
    easy: {
      en: 'Hi! I am Echo. How are you today, and what did you do this morning?',
      ru: 'Привет! Я Echo. Как ты сегодня и чем занимался этим утром?'
    },
    mid: {
      en: 'Hey! Nice to talk to you. How has your week been going so far?',
      ru: 'Привет! Рад пообщаться. Как проходит твоя неделя?'
    }
  },
  'Путешествия': {
    easy: {
      en: 'Hi! Do you like to travel? What city or country do you want to visit?',
      ru: 'Привет! Тебе нравится путешествовать? Какой город или страну ты хочешь посетить?'
    },
    mid: {
      en: 'Hey! Let us talk about travel. What is the most memorable trip you have ever taken?',
      ru: 'Привет! Давай поговорим о путешествиях. Какая поездка запомнилась тебе больше всего?'
    }
  },
  'В кафе и ресторане': {
    easy: {
      en: 'Hello! Welcome to our cafe. What would you like to eat or drink today?',
      ru: 'Здравствуйте! Добро пожаловать в наше кафе. Что вы хотите съесть или выпить сегодня?'
    },
    mid: {
      en: 'Hi there, welcome in! Can I start you off with a coffee or something to eat?',
      ru: 'Привет, добро пожаловать! Принести вам для начала кофе или что-нибудь перекусить?'
    }
  },
  'Работа и карьера': {
    easy: {
      en: 'Hi! What do you do for work or study? Do you like it?',
      ru: 'Привет! Кем ты работаешь или на кого учишься? Тебе нравится?'
    },
    mid: {
      en: 'Hey! Tell me a bit about what you do or what kind of career you are interested in.',
      ru: 'Привет! Расскажи немного о том, чем ты занимаешься или какая карьера тебе интересна.'
    }
  },
  'Хобби и фильмы': {
    easy: {
      en: 'Hi! What do you like to do in your free time? Do you like watching movies?',
      ru: 'Привет! Чем ты любишь заниматься в свободное время? Любишь смотреть фильмы?'
    },
    mid: {
      en: 'Hey! Have you watched any good movies or series lately, or picked up a new hobby?',
      ru: 'Привет! Смотрел какие-нибудь хорошие фильмы или сериалы в последнее время, или появилось новое хобби?'
    }
  },
  'Собеседование на работу': {
    easy: {
      en: 'Hello! Thanks for coming today. Can you tell me a little about yourself?',
      ru: 'Здравствуйте! Спасибо, что пришли сегодня. Можете немного рассказать о себе?'
    },
    mid: {
      en: 'Hello, thanks for joining me today. To start, could you briefly tell me about yourself and your main strengths?',
      ru: 'Здравствуйте, спасибо, что присоединились. Для начала расскажите коротко о себе и своих сильных сторонах.'
    }
  }
};

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(apiKey, model, payload, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      timeoutMs
    );

    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { error: { message: text.slice(0, 200) || `HTTP ${res.status}` } };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    return {
      ok: false,
      status: timedOut ? 504 : 500,
      data: {
        error: {
          message: timedOut
            ? `таймаут ${Math.round(timeoutMs / 1000)}с`
            : (err?.message || 'ошибка сети')
        }
      }
    };
  }
}

function extractJson(rawText) {
  const cleaned = String(rawText || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('ИИ вернул ответ в неожиданном формате.');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'На сервере не настроен GEMINI_API_KEY.' });
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

    if (action === 'start') {
      const bucket = STARTERS[topic] || STARTERS['Свободная тема'];
      const pack = (level === 'A1' || level === 'A2') ? bucket.easy : bucket.mid;
      return res.status(200).json({
        userTranscript: '',
        hasErrors: false,
        correction: '',
        explanationRu: '',
        replyEn: pack.en,
        replyRu: pack.ru
      });
    }

    if (audioBase64 && audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return res.status(413).json({ error: 'Аудио слишком большое. Попробуйте записать сообщение короче 45 секунд.' });
    }

    if (!audioBase64 && !String(text).trim()) {
      return res.status(400).json({ error: 'Пустое сообщение.' });
    }

    const levelDesc = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.B1;

    const systemInstruction = `
You are Echo, a friendly spoken English tutor for Russian-speaking learners.
Student level: ${levelDesc}
Topic: "${topic}".

Return ONLY a valid JSON object with these exact 6 keys:
{
  "userTranscript": "exact English transcription of what the student said",
  "hasErrors": true or false,
  "correction": "natural corrected English sentence if hasErrors is true, else empty string",
  "explanationRu": "short friendly explanation in Russian (1-2 sentences) if hasErrors is true, else short praise in Russian",
  "replyEn": "natural conversational reply in English (1-2 short sentences + a light follow-up question, no markdown or emojis)",
  "replyRu": "natural Russian translation of replyEn"
}
`.trim();

    const contents = [];
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

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
          parts: [{ text: item.text.slice(0, 800) }]
        });
      }
    }

    const userParts = [];
    if (audioBase64) {
      const cleanMime = String(mimeType).split(';')[0].trim() || 'audio/webm';
      userParts.push({ text: 'Listen to the student audio, transcribe it, check for mistakes, and respond in JSON.' });
      userParts.push({ inline_data: { mime_type: cleanMime, data: audioBase64 } });
    } else {
      userParts.push({ text: `Student message: "${String(text).trim().slice(0, 800)}". Check for mistakes and respond in JSON.` });
    }

    contents.push({ role: 'user', parts: userParts });

    const buildPayload = (thinkingConfig) => ({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        ...(thinkingConfig ? { thinkingConfig } : {})
      }
    });

    // Основная быстрая модель — gemini-3.5-flash-lite, запасная — gemini-3.8-flash
    const attempts = [
      { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 16000 },
      { model: 'gemini-3.8-flash', thinking: null, timeout: 11000 }
    ];

    let result = null;
    const errors = [];

    for (const attempt of attempts) {
      result = await callGemini(apiKey, attempt.model, buildPayload(attempt.thinking), attempt.timeout);

      if (!result.ok && result.status === 400 && attempt.thinking) {
        result = await callGemini(apiKey, attempt.model, buildPayload(null), attempt.timeout);
      }

      if (result.ok) break;
      errors.push(`${attempt.model}: ${result.data?.error?.message || result.status}`);
    }

    if (!result || !result.ok) {
      return res.status(502).json({
        error: 'Не удалось получить ответ от ИИ. Детали: ' + errors.join(' | ')
      });
    }

    const parts = result.data?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
    const rawText = textPart?.text || '';

    if (!rawText) {
      return res.status(502).json({ error: 'ИИ вернул пустой ответ. Попробуйте сказать фразу ещё раз.' });
    }

    const parsed = extractJson(rawText);
    return res.status(200).json({
      userTranscript: parsed.userTranscript || text || '',
      hasErrors: Boolean(parsed.hasErrors),
      correction: parsed.correction || '',
      explanationRu: parsed.explanationRu || '',
      replyEn: parsed.replyEn || 'Could you say that again?',
      replyRu: parsed.replyRu || 'Не могли бы вы повторить это ещё раз?'
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Ошибка сервера: ' + (err?.message || 'попробуйте ещё раз.') });
  }
}
