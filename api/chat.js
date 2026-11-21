const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
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

const LANGUAGE_META = {
  en: {
    enName: 'English',
    ruName: 'английский',
    extraNote: ''
  },
  fr: {
    enName: 'French',
    ruName: 'французский',
    extraNote: 'Pay natural attention to gender (le/la), verb conjugations, accents, and polite tu/vous when relevant.'
  },
  es: {
    enName: 'Spanish',
    ruName: 'испанский',
    extraNote: 'Use natural standard Spanish (neutral/Spain). Pay attention to ser/estar, gender, and conjugations.'
  },
  de: {
    enName: 'German',
    ruName: 'немецкий',
    extraNote: 'Pay natural attention to der/die/das, cases, and verb position.'
  },
  it: {
    enName: 'Italian',
    ruName: 'итальянский',
    extraNote: 'Pay natural attention to articles, gender, and verb conjugations.'
  },
  zh: {
    enName: 'Mandarin Chinese (Simplified Chinese characters)',
    ruName: 'китайский',
    extraNote: 'Write target sentences in natural Simplified Chinese characters (汉字). In Russian notes/explanations, include pinyin in parentheses to help the learner read.',
    scriptHint: 'Include pinyin reading in the note field.'
  },
  ja: {
    enName: 'Japanese',
    ruName: 'японский',
    extraNote: 'Write target sentences in natural Japanese (for A1-A2 keep kanji simple or use hiragana). In Russian notes/explanations, include reading in hiragana/romaji when helpful.',
    scriptHint: 'Include reading in hiragana and romaji in the note field.'
  },
  ko: {
    enName: 'Korean',
    ruName: 'корейский',
    extraNote: 'Write target sentences in natural Korean Hangul (polite 해요체 style by default). In Russian notes/explanations, include simple reading hints when helpful.',
    scriptHint: 'Include pronunciation/romanization hint in the note field.'
  }
};

const LEVEL_GUIDANCE = {
  A1: 'Beginner (A1). Use very simple words, short sentences (5-10 words), basic present/past tenses.',
  A2: 'Elementary (A2). Use everyday vocabulary and clear, short sentences.',
  B1: 'Intermediate (B1). Use natural everyday language and clear conversational flow.',
  B2: 'Upper-Intermediate (B2). Use natural expressions, varied grammar, and engaging conversational phrasing.',
  C1: 'Advanced (C1). Speak like an educated native speaker with nuanced vocabulary and natural idioms.'
};

const SCENARIO_SEEDS = {
  'Свободная тема': [
    'Ask a fun "would you rather" question about everyday life.',
    'Start by sharing a tiny relatable moment (like forgetting an umbrella or drinking too much coffee) and ask about their day.',
    'Ask what small thing recently made them smile or annoyed them.',
    'Ask about their ideal weekend if they had zero responsibilities.',
    'Ask about a skill they would love to learn instantly.',
    'Start a light debate: mornings vs. late nights, or city vs. nature.',
    'Ask what song, podcast, or food they have been obsessed with lately.'
  ],
  'Путешествия': [
    'Roleplay: we just met at an airport gate while waiting for a delayed flight.',
    'Ask about a place they visited that surprised them (in a good or bad way).',
    'Imagine they got a free plane ticket for tomorrow — ask where they are flying and why.',
    'Roleplay: you are a hotel receptionist checking them in and asking about their trip.',
    'Ask about their funniest or most stressful travel story.',
    'Ask whether they prefer detailed travel plans or totally spontaneous trips.'
  ],
  'В кафе и ресторане': [
    'Roleplay: you are a friendly barista on a rainy morning recommending today’s special drink.',
    'Roleplay: you are a waiter apologizing because their favorite dish just sold out and offering alternatives.',
    'Roleplay: you are a friend meeting them for dinner and asking what cuisine they are craving.',
    'Roleplay: you are a waiter asking if they have any allergies or dietary preferences before taking their order.',
    'Roleplay: you just brought their meal and are checking how everything tastes and if they want dessert.'
  ],
  'Работа и карьера': [
    'Ask what their dream job would be if money did not matter.',
    'Roleplay: you are a new colleague chatting by the coffee machine on their first week.',
    'Ask whether they prefer working from home, an office, or somewhere totally different.',
    'Ask about the hardest or most interesting task they had to deal with recently.',
    'Ask what kind of boss or teammate they enjoy working with the most.'
  ],
  'Хобби и фильмы': [
    'Ask for a movie or series recommendation they think everyone should watch at least once.',
    'Start by mentioning you are looking for a new weekend hobby and ask what they enjoy doing.',
    'Ask about a movie, game, or book whose ending totally surprised or disappointed them.',
    'Ask if they prefer watching movies at the cinema or at home with snacks, and why.',
    'Ask what hobby they tried once and immediately realized was not for them.'
  ],
  'Собеседование на работу': [
    'Roleplay: you are an interviewer starting warmly and asking what attracted them to this role.',
    'Roleplay: you are an interviewer asking them to tell you about a project or achievement they are proud of.',
    'Roleplay: you are an interviewer asking how they usually handle tight deadlines or stressful days.',
    'Roleplay: you are an interviewer asking what they expect from a good team and manager.',
    'Roleplay: you are an interviewer asking where they see themselves growing in the next couple of years.'
  ]
};

const FALLBACK_STARTERS_BY_LANG = {
  en: [
    { target: 'Hey! Would you rather live by the sea or in a big city?', ru: 'Привет! Ты бы предпочёл жить у моря или в большом городе?' },
    { target: 'Hi there! What is one small thing that made your week better?', ru: 'Привет! Какая мелочь сделала твою неделю лучше?' }
  ],
  fr: [
    { target: 'Salut ! Tu préfères le café ou le thé le matin ?', ru: 'Привет! Ты предпочитаешь кофе или чай по утрам?' },
    { target: 'Bonjour ! Qu’est-ce que tu aimes faire pendant ton temps libre ?', ru: 'Привет! Чем ты любишь заниматься в свободное время?' }
  ],
  es: [
    { target: '¡Hola! ¿Prefieres la playa o la montaña para las vacaciones?', ru: 'Привет! Для отпуска ты предпочитаешь пляж или горы?' },
    { target: '¡Hola! ¿Qué tal va tu semana hasta ahora?', ru: 'Привет! Как пока проходит твоя неделя?' }
  ],
  de: [
    { target: 'Hallo! Bist du eher ein Morgenmensch oder ein Nachtmensch?', ru: 'Привет! Ты скорее жаворонок или сова?' },
    { target: 'Hi! Was machst du am liebsten am Wochenende?', ru: 'Привет! Чем ты больше всего любишь заниматься на выходных?' }
  ],
  it: [
    { target: 'Ciao! Preferisci il caffè o il tè al mattino?', ru: 'Привет! Ты предпочитаешь кофе или чай утром?' },
    { target: 'Ciao! Qual è il tuo piatto preferito?', ru: 'Привет! Какое твоё любимое блюдо?' }
  ],
  zh: [
    { target: '你好！你周末一般喜欢做什么？', ru: 'Привет! Чем ты обычно любишь заниматься на выходных?' },
    { target: '你好！你最喜欢吃什么菜？', ru: 'Привет! Какое блюдо тебе нравится больше всего?' }
  ],
  ja: [
    { target: 'こんにちは！休みの日は何をするのが好きですか？', ru: 'Привет! Чем тебе нравится заниматься в выходные?' },
    { target: 'こんにちは！好きな食べ物は何ですか？', ru: 'Привет! Какая твоя любимая еда?' }
  ],
  ko: [
    { target: '안녕하세요! 주말에 보통 뭐 하는 걸 좋아해요?', ru: 'Привет! Чем тебе обычно нравится заниматься на выходных?' },
    { target: '안녕하세요! 제일 좋아하는 음식이 뭐예요?', ru: 'Привет! Какая твоя самая любимая еда?' }
  ]
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
      return {
        ok: false,
        status: res.status,
        data: { error: { message: `не JSON (${res.status}): ${text.replace(/\s+/g, ' ').slice(0, 80)}` } }
      };
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

function mergeSystemIntoUser(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const sysParts = messages.filter(m => m.role === 'system').map(m => m.content);
  if (sysParts.length === 0) return messages;

  const rest = messages.filter(m => m.role !== 'system').map(m => ({ ...m }));
  const sysText = sysParts.join('\n\n');
  if (rest.length > 0 && rest[0].role === 'user') {
    rest[0].content = `${sysText}\n\n${rest[0].content}`;
  } else {
    rest.unshift({ role: 'user', content: sysText });
  }
  return rest;
}

function extractOpenAiText(data) {
  const msg = data?.choices?.[0]?.message;
  if (typeof msg?.content === 'string' && msg.content.trim()) return msg.content;
  if (Array.isArray(msg?.content)) {
    const joined = msg.content
      .map(part => (typeof part === 'string' ? part : (part?.text || '')))
      .join('')
      .trim();
    if (joined) return joined;
  }
  if (typeof data?.choices?.[0]?.text === 'string' && data.choices[0].text.trim()) {
    return data.choices[0].text;
  }
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  return '';
}

async function callOpenAiCompatible({ url, apiKey, model, messages, temperature = 0.7, maxTokens = 2000, jsonMode = false, extraHeaders = {} }, timeoutMs) {
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  };

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders
        },
        body: JSON.stringify(body)
      },
      timeoutMs
    );

    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      return {
        ok: false,
        status: res.status,
        data: { error: { message: `не JSON (${res.status}): ${text.replace(/\s+/g, ' ').slice(0, 80)}` } }
      };
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

async function transcribeWithGroq(groqKey, audioBase64, mimeType, langCode, timeoutMs = 8000) {
  const url = 'https://api.groq.com/openai/v1/audio/transcriptions';
  try {
    const cleanMime = String(mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
    const ext = cleanMime.includes('mp4') || cleanMime.includes('m4a')
      ? 'm4a'
      : cleanMime.includes('ogg')
        ? 'ogg'
        : cleanMime.includes('mpeg') || cleanMime.includes('mp3')
          ? 'mp3'
          : 'webm';

    const buffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: cleanMime }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', langCode);

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form
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

    if (!res.ok) {
      return { ok: false, error: shortErrorText(data?.error?.message, res.status) };
    }

    return { ok: true, text: String(data.text || '').trim() };
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    return { ok: false, error: timedOut ? 'таймаут Whisper' : (err?.message || 'ошибка Whisper') };
  }
}

function extractJson(rawText) {
  const cleaned = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
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

function shortErrorText(msg, status) {
  const clean = String(msg || status || '').replace(/\s+/g, ' ').trim();
  if (/high demand|overloaded|unavailable/i.test(clean) || status === 503) return '503 перегрузка';
  if (/not found|no longer available|no endpoints/i.test(clean) || status === 404) return '404 недоступна';
  if (/quota|rate limit|resource exhausted|limit/i.test(clean) || status === 429) return '429 лимит';
  if (/invalid api key|unauthorized|bad credentials|user not found/i.test(clean) || status === 401) return '401 неверный ключ';
  if (status === 403 || /permission|forbidden/i.test(clean)) return '403 нет прав Models';
  return clean.length > 95 ? clean.slice(0, 95) + '…' : clean;
}

// Цепочка: Gemini Lite → GitHub Models (GPT-4.1-mini / GPT-4o-mini) → OpenRouter/Groq → Gemini Flash (16с)
async function runTextTask({
  geminiKey,
  githubToken,
  openRouterKey,
  groqKey,
  buildGeminiPayload,
  chatMessages,
  temperature = 0.7,
  maxTokens = 2000,
  totalBudgetMs = 26000,
  parseResult
}) {
  const deadline = Date.now() + totalBudgetMs;
  const errors = [];

  const steps = [];
  if (geminiKey) {
    steps.push({ provider: 'gemini', model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 6500 });
  }
  if (githubToken) {
    steps.push({
      provider: 'github',
      url: 'https://models.github.ai/inference/chat/completions',
      model: 'openai/gpt-4.1-mini',
      jsonMode: true,
      timeout: 11000
    });
    steps.push({
      provider: 'github',
      url: 'https://models.github.ai/inference/chat/completions',
      model: 'openai/gpt-4o-mini',
      jsonMode: true,
      timeout: 9000
    });
  }
  if (openRouterKey) {
    steps.push({ provider: 'openrouter', model: 'openrouter/free', timeout: 9000 });
    steps.push({ provider: 'openrouter', model: 'google/gemma-3-27b-it:free', mergeSystem: true, timeout: 8000 });
  }
  if (groqKey) {
    steps.push({ provider: 'groq', model: 'llama-3.3-70b-versatile', timeout: 9000 });
  }
  if (geminiKey) {
    steps.push({ provider: 'gemini', model: 'gemini-flash-latest', thinking: { thinkingBudget: 0 }, timeout: 16000 });
  }

  for (const step of steps) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;
    const timeout = Math.min(step.timeout, remaining);

    let rawText = '';
    let lastData = null;

    if (step.provider === 'gemini') {
      let result = await callGemini(geminiKey, step.model, buildGeminiPayload(step.thinking), timeout);
      if (!result.ok && result.status === 400 && step.thinking) {
        const rem2 = deadline - Date.now();
        if (rem2 >= 2000) {
          result = await callGemini(geminiKey, step.model, buildGeminiPayload(null), Math.min(timeout, rem2));
        }
      }
      if (!result.ok) {
        errors.push(`${step.model}: ${shortErrorText(result.data?.error?.message, result.status)}`);
        continue;
      }
      lastData = result.data;
      const parts = result.data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
      rawText = textPart?.text || '';
    } else if (step.provider === 'github') {
      const ghHeaders = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      let result = await callOpenAiCompatible(
        {
          url: step.url,
          apiKey: githubToken,
          model: step.model,
          messages: chatMessages,
          temperature,
          maxTokens: Math.min(maxTokens, 4096),
          jsonMode: Boolean(step.jsonMode),
          extraHeaders: ghHeaders
        },
        timeout
      );
      if (!result.ok && result.status === 400 && step.jsonMode) {
        const rem2 = deadline - Date.now();
        if (rem2 >= 2000) {
          result = await callOpenAiCompatible(
            {
              url: step.url,
              apiKey: githubToken,
              model: step.model,
              messages: chatMessages,
              temperature,
              maxTokens: Math.min(maxTokens, 4096),
              jsonMode: false,
              extraHeaders: ghHeaders
            },
            Math.min(timeout, rem2)
          );
        }
      }
      if (!result.ok) {
        const shortName = step.model.split('/').pop();
        errors.push(`gh/${shortName}: ${shortErrorText(result.data?.error?.message, result.status)}`);
        continue;
      }
      lastData = result.data;
      rawText = extractOpenAiText(result.data);
    } else if (step.provider === 'openrouter') {
      const msgs = step.mergeSystem ? mergeSystemIntoUser(chatMessages) : chatMessages;
      const result = await callOpenAiCompatible(
        {
          url: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: openRouterKey,
          model: step.model,
          messages: msgs,
          temperature,
          maxTokens: Math.min(maxTokens, 4096),
          jsonMode: false,
          extraHeaders: {
            'HTTP-Referer': 'https://echo-english-inky.vercel.app',
            'X-Title': 'Echo Language Platform'
          }
        },
        timeout
      );
      if (!result.ok) {
        const shortName = step.model.split('/').pop();
        errors.push(`or/${shortName}: ${shortErrorText(result.data?.error?.message, result.status)}`);
        continue;
      }
      lastData = result.data;
      rawText = extractOpenAiText(result.data);
    } else if (step.provider === 'groq') {
      const result = await callOpenAiCompatible(
        {
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: groqKey,
          model: step.model,
          messages: chatMessages,
          temperature,
          maxTokens: Math.min(maxTokens, 4096),
          jsonMode: true
        },
        timeout
      );
      if (!result.ok) {
        errors.push(`groq/${step.model}: ${shortErrorText(result.data?.error?.message, result.status)}`);
        continue;
      }
      lastData = result.data;
      rawText = extractOpenAiText(result.data);
    }

    if (!rawText) {
      const preview = JSON.stringify(lastData || {}).replace(/\s+/g, ' ').slice(0, 90);
      errors.push(`${step.model}: пустой ответ (${preview})`);
      continue;
    }

    try {
      const parsed = extractJson(rawText);
      const value = parseResult ? parseResult(parsed) : parsed;
      if (value) {
        return { ok: true, value, model: step.model };
      }
      errors.push(`${step.model}: неполный ответ`);
    } catch (_) {
      errors.push(`${step.model}: ошибка формата`);
    }
  }

  return { ok: false, errors };
}

function formatOverloadError(prefix, errors) {
  const joined = errors.join(' | ');
  if (/перегрузка|high demand|overloaded|503|429/i.test(joined)) {
    return `${prefix} Серверы ИИ временно перегружены — попробуйте ещё раз через пару секунд. [${joined}]`;
  }
  return `${prefix} [${joined}]`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается.' });
  }

  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const githubToken = (process.env.GITHUB_TOKEN || '').trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const groqKey = (process.env.GROQ_API_KEY || '').trim();

  if (!geminiKey && !githubToken && !openRouterKey && !groqKey) {
    return res.status(500).json({ error: 'На сервере не настроены ключи ИИ (GEMINI_API_KEY или GITHUB_TOKEN).' });
  }

  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const clientIp = String(rawIp).split(',')[0].trim();

  if (!checkRateLimit(clientIp).allowed) {
    return res.status(429).json({
      error: 'Превышен лимит запросов в час. Попробуйте снова немного позже.'
    });
  }

  try {
    const {
      action = 'message',
      language = 'en',
      audioBase64 = '',
      mimeType = 'audio/webm',
      text = '',
      word = '',
      context = '',
      customTopic = '',
      grammarTopic = '',
      question = '',
      level = 'B1',
      topic = 'Свободная тема',
      history = []
    } = req.body || {};

    const langCode = LANGUAGE_META[language] ? language : 'en';
    const lang = LANGUAGE_META[langCode];
    const levelDesc = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.B1;

    // 1. Быстрый перевод слова или фразы в контексте
    if (action === 'translate') {
      const cleanWord = String(word || '').trim().slice(0, 200);
      const cleanCtx = String(context || '').trim().slice(0, 400);
      if (!cleanWord) {
        return res.status(400).json({ error: 'Не указано слово для перевода.' });
      }

      const trPrompt = `
Translate the ${lang.enName} word or phrase "${cleanWord}" into Russian${cleanCtx ? ` as used in the sentence: "${cleanCtx}"` : ''}.
${lang.scriptHint || ''}

Return ONLY a valid JSON object with no extra text:
{
  "translation": "concise Russian translation (1-3 words)",
  "note": "very short usage note or reading hint (max 12 words, or empty string)"
}
`.trim();

      const task = await runTextTask({
        geminiKey,
        githubToken,
        openRouterKey,
        groqKey,
        temperature: 0.3,
        maxTokens: 250,
        totalBudgetMs: 18000,
        chatMessages: [{ role: 'user', content: trPrompt }],
        buildGeminiPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: trPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 250,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                translation: { type: 'STRING' },
                note: { type: 'STRING' }
              },
              required: ['translation', 'note']
            },
            ...(thinkingConfig ? { thinkingConfig } : {})
          }
        }),
        parseResult: (parsed) => ({
          translation: String(parsed.translation || '').trim(),
          note: String(parsed.note || '').trim()
        })
      });

      if (!task.ok) {
        return res.status(502).json({ error: 'Не удалось перевести слово. Введите перевод вручную.' });
      }

      return res.status(200).json(task.value);
    }

    // 2. Подробный урок и задания по грамматике
    if (action === 'grammar_lesson') {
      const targetTopic = String(grammarTopic || '').trim().slice(0, 140) || 'Базовая грамматика';

      const grammarPrompt = `
You are Echo, an expert, super-clear ${lang.enName} grammar tutor for Russian-speaking learners.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Grammar topic: "${targetTopic}"
${lang.extraNote}

Create a thorough, easy-to-understand grammar guide in Russian covering the ENTIRE topic in ${lang.enName} (never leave out negative forms, questions, or key rules!), plus 5 interactive exercises strictly suited to level ${level}.

Requirements:
- "whenToUseRu": 3-4 concise points in plain Russian explaining main situations when this grammar is used.
- "sections": 3-4 detailed blocks covering EVERY major part of the topic (for tenses: Утверждение (+), Отрицание (−), Вопросы (?) и ответы, Важные правила и нюансы). Each block has "headingRu", "formula", "explanationRu" (2-4 clear Russian sentences), and 2-3 "examples" with "target" (${lang.enName}) and "ru".
- "markers": 4-7 signal words/phrases in ${lang.enName} with short Russian translations.
- "commonMistakes": 2-3 typical mistakes Russian speakers make, with "wrongTarget", "rightTarget", "explanationRu".
- "exercises": exactly 5 varied exercises in ${lang.enName} (mix affirmative, negative, questions). First 3 have "type": "choice" with 4 distinct "options"; last 2 have "type": "input" with "options": [] and a clear "hint". Every exercise has "sentence" containing "___", exact "answer", "fullSentence", "translationRu", "explanationRu".
- No markdown symbols (*, **, #) and no emojis anywhere.

Return ONLY a valid JSON object with no extra text before or after it:
{
  "topicTitle": "string",
  "whenToUseRu": ["string"],
  "sections": [
    {
      "headingRu": "string",
      "formula": "string",
      "explanationRu": "string",
      "examples": [{ "target": "string", "ru": "string" }]
    }
  ],
  "markers": ["string"],
  "commonMistakes": [
    { "wrongTarget": "string", "rightTarget": "string", "explanationRu": "string" }
  ],
  "exercises": [
    {
      "type": "choice",
      "promptRu": "string",
      "sentence": "string with ___",
      "hint": "string",
      "options": ["a", "b", "c", "d"],
      "answer": "string",
      "fullSentence": "string",
      "translationRu": "string",
      "explanationRu": "string"
    }
  ]
}
`.trim();

      const grammarSchema = {
        type: 'OBJECT',
        properties: {
          topicTitle: { type: 'STRING' },
          whenToUseRu: { type: 'ARRAY', items: { type: 'STRING' } },
          sections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                headingRu: { type: 'STRING' },
                formula: { type: 'STRING' },
                explanationRu: { type: 'STRING' },
                examples: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      target: { type: 'STRING' },
                      ru: { type: 'STRING' }
                    },
                    required: ['target', 'ru']
                  }
                }
              },
              required: ['headingRu', 'formula', 'explanationRu', 'examples']
            }
          },
          markers: { type: 'ARRAY', items: { type: 'STRING' } },
          commonMistakes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                wrongTarget: { type: 'STRING' },
                rightTarget: { type: 'STRING' },
                explanationRu: { type: 'STRING' }
              },
              required: ['wrongTarget', 'rightTarget', 'explanationRu']
            }
          },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                type: { type: 'STRING' },
                promptRu: { type: 'STRING' },
                sentence: { type: 'STRING' },
                hint: { type: 'STRING' },
                options: { type: 'ARRAY', items: { type: 'STRING' } },
                answer: { type: 'STRING' },
                fullSentence: { type: 'STRING' },
                translationRu: { type: 'STRING' },
                explanationRu: { type: 'STRING' }
              },
              required: ['type', 'promptRu', 'sentence', 'hint', 'options', 'answer', 'fullSentence', 'translationRu', 'explanationRu']
            }
          }
        },
        required: ['topicTitle', 'whenToUseRu', 'sections', 'markers', 'commonMistakes', 'exercises']
      };

      const task = await runTextTask({
        geminiKey,
        githubToken,
        openRouterKey,
        groqKey,
        temperature: 0.7,
        maxTokens: 4000,
        totalBudgetMs: 26000,
        chatMessages: [{ role: 'user', content: grammarPrompt }],
        buildGeminiPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: grammarPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4500,
            responseMimeType: 'application/json',
            responseSchema: grammarSchema,
            ...(thinkingConfig ? { thinkingConfig } : {})
          }
        }),
        parseResult: (parsed) => {
          const cleanSections = (Array.isArray(parsed.sections) ? parsed.sections : [])
            .filter(s => s && (s.headingRu || s.explanationRu))
            .map(s => ({
              headingRu: String(s.headingRu || '').trim(),
              formula: String(s.formula || '').trim(),
              explanationRu: String(s.explanationRu || '').trim(),
              examples: (Array.isArray(s.examples) ? s.examples : [])
                .filter(e => e && (e.target || e.en))
                .map(e => ({ target: String(e.target || e.en).trim(), ru: String(e.ru || '').trim() }))
            }));

          const cleanExercises = (Array.isArray(parsed.exercises) ? parsed.exercises : [])
            .filter(ex => ex && typeof ex.sentence === 'string' && typeof ex.answer === 'string' && ex.answer.trim())
            .map(ex => {
              const isChoice = ex.type === 'choice' && Array.isArray(ex.options) && ex.options.length >= 2;
              return {
                type: isChoice ? 'choice' : 'input',
                promptRu: String(ex.promptRu || (isChoice ? 'Выберите правильный вариант' : 'Впишите правильную форму')).trim(),
                sentence: ex.sentence.trim(),
                hint: String(ex.hint || '').trim(),
                options: isChoice ? ex.options.map(o => String(o).trim()).filter(Boolean) : [],
                answer: ex.answer.trim(),
                fullSentence: String(ex.fullSentence || ex.sentence.replace('___', ex.answer)).trim(),
                translationRu: String(ex.translationRu || '').trim(),
                explanationRu: String(ex.explanationRu || '').trim()
              };
            });

          if (cleanSections.length === 0 || cleanExercises.length === 0) return null;

          return {
            topicTitle: String(parsed.topicTitle || targetTopic).trim(),
            whenToUseRu: (Array.isArray(parsed.whenToUseRu) ? parsed.whenToUseRu : [])
              .map(x => String(x || '').trim()).filter(Boolean),
            sections: cleanSections,
            markers: (Array.isArray(parsed.markers) ? parsed.markers : [])
              .map(x => String(x || '').trim()).filter(Boolean),
            commonMistakes: (Array.isArray(parsed.commonMistakes) ? parsed.commonMistakes : [])
              .filter(m => m && (m.wrongTarget || m.wrongEn) && (m.rightTarget || m.rightEn))
              .map(m => ({
                wrongTarget: String(m.wrongTarget || m.wrongEn).trim(),
                rightTarget: String(m.rightTarget || m.rightEn).trim(),
                explanationRu: String(m.explanationRu || '').trim()
              })),
            exercises: cleanExercises
          };
        }
      });

      if (!task.ok) {
        return res.status(502).json({
          error: formatOverloadError('Не удалось составить урок.', task.errors)
        });
      }

      return res.status(200).json(task.value);
    }

    // 3. Вопрос ИИ по текущей теме грамматики
    if (action === 'grammar_ask') {
      const cleanQ = String(question || '').trim().slice(0, 400);
      const targetTopic = String(grammarTopic || '').trim().slice(0, 140);
      if (!cleanQ) {
        return res.status(400).json({ error: 'Введите вопрос.' });
      }

      const askPrompt = `
You are Echo, a friendly ${lang.enName} grammar tutor for Russian learners.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Current grammar topic: "${targetTopic || 'Общая грамматика'}"
Student question: "${cleanQ}"
${lang.extraNote}

Answer clearly and thoroughly in Russian (2-5 sentences, no markdown). Also give one helpful example in ${lang.enName} with Russian translation.

Return ONLY a valid JSON object with no extra text:
{
  "answerRu": "string",
  "exampleTarget": "string in ${lang.enName}",
  "exampleRu": "Russian translation"
}
`.trim();

      const task = await runTextTask({
        geminiKey,
        githubToken,
        openRouterKey,
        groqKey,
        temperature: 0.5,
        maxTokens: 600,
        totalBudgetMs: 20000,
        chatMessages: [{ role: 'user', content: askPrompt }],
        buildGeminiPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: askPrompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 550,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                answerRu: { type: 'STRING' },
                exampleTarget: { type: 'STRING' },
                exampleRu: { type: 'STRING' }
              },
              required: ['answerRu', 'exampleTarget', 'exampleRu']
            },
            ...(thinkingConfig ? { thinkingConfig } : {})
          }
        }),
        parseResult: (parsed) => ({
          answerRu: String(parsed.answerRu || '').trim(),
          exampleTarget: String(parsed.exampleTarget || parsed.exampleEn || '').trim(),
          exampleRu: String(parsed.exampleRu || '').trim()
        })
      });

      if (!task.ok) {
        return res.status(502).json({
          error: formatOverloadError('Не удалось получить ответ.', task.errors)
        });
      }

      return res.status(200).json(task.value);
    }

    // 4. Генерация адаптированного текста для вкладки «Чтение»
    if (action === 'reading') {
      const finalTopic = String(customTopic || '').trim().slice(0, 120) || topic;
      const styles = [
        'a short relatable story from everyday life',
        'an interesting mini-article with surprising facts',
        'a vivid diary entry about a memorable day',
        'a light practical guide or life observation'
      ];
      const chosenStyle = pickRandom(styles);

      const readingPrompt = `
Write ${chosenStyle} strictly in ${lang.enName}, adapted for a Russian learner at level: ${levelDesc}
Topic: "${finalTopic}".
${lang.extraNote}

Requirements:
- Write 2 or 3 short paragraphs (total 6 to 9 natural sentences) strictly in ${lang.enName}.
- Use vocabulary and grammar appropriate for ${level}, including useful everyday words worth learning.
- For each sentence, include its paragraph number "p" (1, 2, or 3), the sentence in ${lang.enName} in "target", and an accurate natural Russian translation in "ru".
- No markdown, no emojis.

Return ONLY a valid JSON object with no extra text before or after it:
{
  "titleTarget": "Short catchy title in ${lang.enName}",
  "titleRu": "Russian translation of the title",
  "sentences": [
    { "p": 1, "target": "First sentence in ${lang.enName}.", "ru": "Первое предложение на русском." },
    { "p": 1, "target": "Second sentence.", "ru": "Второе предложение." },
    { "p": 2, "target": "First sentence of second paragraph.", "ru": "Первое предложение второго абзаца." }
  ]
}
`.trim();

      const readingSchema = {
        type: 'OBJECT',
        properties: {
          titleTarget: { type: 'STRING' },
          titleRu: { type: 'STRING' },
          sentences: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                p: { type: 'INTEGER' },
                target: { type: 'STRING' },
                ru: { type: 'STRING' }
              },
              required: ['p', 'target', 'ru']
            }
          }
        },
        required: ['titleTarget', 'titleRu', 'sentences']
      };

      const task = await runTextTask({
        geminiKey,
        githubToken,
        openRouterKey,
        groqKey,
        temperature: 0.75,
        maxTokens: 2400,
        totalBudgetMs: 26000,
        chatMessages: [{ role: 'user', content: readingPrompt }],
        buildGeminiPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: readingPrompt }] }],
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 2400,
            responseMimeType: 'application/json',
            responseSchema: readingSchema,
            ...(thinkingConfig ? { thinkingConfig } : {})
          }
        }),
        parseResult: (parsed) => {
          const rawSentences = Array.isArray(parsed.sentences) ? parsed.sentences : [];
          const groupedMap = new Map();

          for (const s of rawSentences) {
            const txt = s && (s.target || s.en);
            if (!txt || typeof txt !== 'string' || !txt.trim()) continue;
            const pNum = Number.isFinite(Number(s.p)) ? Number(s.p) : 1;
            if (!groupedMap.has(pNum)) groupedMap.set(pNum, []);
            groupedMap.get(pNum).push({
              target: txt.trim(),
              ru: String(s.ru || '').trim()
            });
          }

          const cleanParagraphs = Array.from(groupedMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, list]) => list)
            .filter(list => list.length > 0);

          if (cleanParagraphs.length === 0) return null;

          return {
            titleTarget: String(parsed.titleTarget || parsed.titleEn || finalTopic).trim(),
            titleRu: String(parsed.titleRu || '').trim(),
            paragraphs: cleanParagraphs
          };
        }
      });

      if (!task.ok) {
        return res.status(502).json({
          error: formatOverloadError('Не удалось создать текст.', task.errors)
        });
      }

      return res.status(200).json(task.value);
    }

    // 5. Разнообразный старт диалога
    if (action === 'start') {
      const seeds = SCENARIO_SEEDS[topic] || SCENARIO_SEEDS['Свободная тема'];
      const chosenSeed = pickRandom(seeds);

      const startPrompt = `
You are Echo, a friendly spoken ${lang.enName} tutor.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Topic: "${topic}"
Opening scenario: ${chosenSeed}
${lang.extraNote}

Write a fresh, natural opening message STRICTLY in ${lang.enName} (1-2 short sentences ending with an engaging question) and its natural Russian translation.
Avoid cliché textbook openings — jump right into the vibe of the scenario! No markdown or emojis.

Return ONLY a valid JSON object with no extra text:
{
  "replyTarget": "opening line in ${lang.enName}",
  "replyRu": "natural Russian translation"
}
`.trim();

      const task = await runTextTask({
        geminiKey,
        githubToken,
        openRouterKey,
        groqKey,
        temperature: 0.95,
        maxTokens: 320,
        totalBudgetMs: 14000,
        chatMessages: [{ role: 'user', content: startPrompt }],
        buildGeminiPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: startPrompt }] }],
          generationConfig: {
            temperature: 1.0,
            maxOutputTokens: 320,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                replyTarget: { type: 'STRING' },
                replyRu: { type: 'STRING' }
              },
              required: ['replyTarget', 'replyRu']
            },
            ...(thinkingConfig ? { thinkingConfig } : {})
          }
        }),
        parseResult: (parsed) => {
          const reply = parsed.replyTarget || parsed.replyEn;
          if (!reply) return null;
          return {
            userTranscript: '',
            hasErrors: false,
            correction: '',
            explanationRu: '',
            replyTarget: String(reply).trim(),
            replyRu: String(parsed.replyRu || '').trim()
          };
        }
      });

      if (task.ok) {
        return res.status(200).json(task.value);
      }

      const list = FALLBACK_STARTERS_BY_LANG[langCode] || FALLBACK_STARTERS_BY_LANG.en;
      const fallback = pickRandom(list);
      return res.status(200).json({
        userTranscript: '',
        hasErrors: false,
        correction: '',
        explanationRu: '',
        replyTarget: fallback.target,
        replyRu: fallback.ru
      });
    }

    // 6. Основной диалог (голос или текст)
    if (audioBase64 && audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return res.status(413).json({ error: 'Аудио слишком большое. Попробуйте записать сообщение короче 45 секунд.' });
    }

    if (!audioBase64 && !String(text).trim()) {
      return res.status(400).json({ error: 'Пустое сообщение.' });
    }

    const systemInstruction = `
You are Echo, a friendly spoken ${lang.enName} tutor for Russian-speaking learners.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Topic: "${topic}".
${lang.extraNote}

On every message:
1. Put exact transcription of what the student said in ${lang.enName} in "userTranscript".
2. If there are grammar, word choice, or phrasing mistakes, set "hasErrors": true, give a natural corrected version in ${lang.enName} in "correction", and explain briefly in Russian (1-2 sentences) in "explanationRu". Otherwise set "hasErrors": false, "correction": "", and write short praise in Russian in "explanationRu".
3. Reply naturally STRICTLY in ${lang.enName} in "replyTarget" (1-2 short sentences + a light follow-up question, no markdown or emojis) and translate it into Russian in "replyRu".

Return ONLY a valid JSON object with no extra text:
{
  "userTranscript": "string",
  "hasErrors": true,
  "correction": "string",
  "explanationRu": "string",
  "replyTarget": "string",
  "replyRu": "string"
}
`.trim();

    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    const buildGeminiContents = (userParts) => {
      const contents = [];
      if (safeHistory.length > 0 && safeHistory[0].role === 'model') {
        contents.push({
          role: 'user',
          parts: [{ text: `Let's practice ${lang.enName} on the topic "${topic}".` }]
        });
      }
      for (const item of safeHistory) {
        if ((item.role === 'user' || item.role === 'model') && typeof item.text === 'string' && item.text.trim()) {
          contents.push({ role: item.role, parts: [{ text: item.text.slice(0, 800) }] });
        }
      }
      contents.push({ role: 'user', parts: userParts });
      return contents;
    };

    const buildChatMessages = (userText) => {
      const msgs = [{ role: 'system', content: systemInstruction }];
      for (const item of safeHistory) {
        if ((item.role === 'user' || item.role === 'model') && typeof item.text === 'string' && item.text.trim()) {
          msgs.push({
            role: item.role === 'model' ? 'assistant' : 'user',
            content: item.text.slice(0, 800)
          });
        }
      }
      msgs.push({
        role: 'user',
        content: `Student message in ${lang.enName}: "${String(userText).trim().slice(0, 800)}". Check for mistakes and respond strictly in JSON.`
      });
      return msgs;
    };

    const chatSchema = {
      type: 'OBJECT',
      properties: {
        userTranscript: { type: 'STRING' },
        hasErrors: { type: 'BOOLEAN' },
        correction: { type: 'STRING' },
        explanationRu: { type: 'STRING' },
        replyTarget: { type: 'STRING' },
        replyRu: { type: 'STRING' }
      },
      required: ['userTranscript', 'hasErrors', 'correction', 'explanationRu', 'replyTarget', 'replyRu']
    };

    const parseChat = (fallbackUserText) => (parsed) => ({
      userTranscript: String(parsed.userTranscript || fallbackUserText || '').trim(),
      hasErrors: Boolean(parsed.hasErrors),
      correction: String(parsed.correction || '').trim(),
      explanationRu: String(parsed.explanationRu || '').trim(),
      replyTarget: String(parsed.replyTarget || parsed.replyEn || '...').trim(),
      replyRu: String(parsed.replyRu || '').trim()
    });

    // Ветка с аудио: перебор моделей Gemini → если подключён Groq, Whisper + текстовый ИИ
    if (audioBase64) {
      const errors = [];
      const cleanMime = String(mimeType).split(';')[0].trim() || 'audio/webm';
      const audioParts = [
        { text: `Listen to the student audio in ${lang.enName}, transcribe it, check for mistakes, and respond in JSON.` },
        { inline_data: { mime_type: cleanMime, data: audioBase64 } }
      ];

      const buildAudioGeminiPayload = (thinkingConfig) => ({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: buildGeminiContents(audioParts),
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 750,
          responseMimeType: 'application/json',
          responseSchema: chatSchema,
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      });

      if (geminiKey) {
        const audioModels = [
          { model: 'gemini-3.5-flash-lite', timeout: 7000 },
          { model: 'gemini-flash-latest', timeout: 14000 },
          { model: 'gemini-3.5-flash', timeout: 12000 }
        ];
        for (const am of audioModels) {
          const gRes = await callGemini(geminiKey, am.model, buildAudioGeminiPayload({ thinkingBudget: 0 }), am.timeout);
          if (gRes.ok) {
            try {
              const parts = gRes.data?.candidates?.[0]?.content?.parts || [];
              const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
              const parsed = extractJson(textPart?.text || '');
              return res.status(200).json(parseChat('')(parsed));
            } catch (_) {
              errors.push(`${am.model}: ошибка формата`);
            }
          } else {
            errors.push(`${am.model}: ${shortErrorText(gRes.data?.error?.message, gRes.status)}`);
          }
        }
      }

      if (groqKey) {
        const stt = await transcribeWithGroq(groqKey, audioBase64, cleanMime, langCode, 8000);
        if (stt.ok && stt.text) {
          const fallbackTask = await runTextTask({
            geminiKey: '',
            githubToken,
            openRouterKey,
            groqKey,
            temperature: 0.8,
            maxTokens: 750,
            totalBudgetMs: 14000,
            chatMessages: buildChatMessages(stt.text),
            buildGeminiPayload: () => ({}),
            parseResult: parseChat(stt.text)
          });
          if (fallbackTask.ok) {
            return res.status(200).json(fallbackTask.value);
          }
          errors.push(...fallbackTask.errors);
        } else if (stt.ok && !stt.text) {
          return res.status(400).json({ error: 'Не удалось расслышать голос. Попробуйте сказать фразу чуть громче.' });
        } else {
          errors.push(`groq/whisper: ${stt.error}`);
        }
      }

      return res.status(502).json({
        error: formatOverloadError('Не удалось разобрать голосовое сообщение.', errors)
      });
    }

    // Ветка с текстом
    const cleanText = String(text).trim().slice(0, 800);
    const textParts = [{ text: `Student message in ${lang.enName}: "${cleanText}". Check for mistakes and respond in JSON.` }];

    const task = await runTextTask({
      geminiKey,
      githubToken,
      openRouterKey,
      groqKey,
      temperature: 0.8,
      maxTokens: 750,
      totalBudgetMs: 26000,
      chatMessages: buildChatMessages(cleanText),
      buildGeminiPayload: (thinkingConfig) => ({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: buildGeminiContents(textParts),
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 750,
          responseMimeType: 'application/json',
          responseSchema: chatSchema,
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      }),
      parseResult: parseChat(cleanText)
    });

    if (!task.ok) {
      return res.status(502).json({
        error: formatOverloadError('Не удалось получить ответ от ИИ.', task.errors)
      });
    }

    return res.status(200).json(task.value);
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Ошибка сервера: ' + (err?.message || 'попробуйте ещё раз.') });
  }
}
