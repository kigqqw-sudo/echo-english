const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const MAX_AUDIO_BASE64_LENGTH = 4_000_000;

const ipBuckets = new Map();
const seenHistoryByClient = new Map();

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

function normalizeKey(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

function getSeenList(clientIp, bucket) {
  const mapKey = `${clientIp}:${bucket}`;
  const entry = seenHistoryByClient.get(mapKey);
  if (!entry || Date.now() - entry.updatedAt > 6 * 60 * 60 * 1000) {
    return [];
  }
  return entry.ids;
}

function markSeenId(clientIp, bucket, id) {
  if (!id) return;
  const mapKey = `${clientIp}:${bucket}`;
  const current = getSeenList(clientIp, bucket).filter(x => x !== id);
  current.push(id);
  seenHistoryByClient.set(mapKey, {
    ids: current.slice(-50),
    updatedAt: Date.now()
  });

  if (seenHistoryByClient.size > 2000) {
    const oldestKey = seenHistoryByClient.keys().next().value;
    if (oldestKey) seenHistoryByClient.delete(oldestKey);
  }
}

function resetSeenKeepLast(clientIp, bucket, lastId) {
  const mapKey = `${clientIp}:${bucket}`;
  seenHistoryByClient.set(mapKey, {
    ids: lastId ? [lastId] : [],
    updatedAt: Date.now()
  });
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, key, enabled: Boolean(url && key) };
}

function getSupabaseHeaders(key, extra = {}) {
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra
  };
  if (!key.startsWith('sb_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

async function supabaseSelect(table, queryString) {
  const { url, key, enabled } = getSupabaseConfig();
  if (!enabled) return [];
  try {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/${table}?${queryString}`,
      {
        method: 'GET',
        headers: getSupabaseHeaders(key)
      },
      4500
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

async function supabaseInsertIgnore(table, onConflict, row) {
  const { url, key, enabled } = getSupabaseConfig();
  if (!enabled) return null;
  try {
    const res = await fetchWithTimeout(
      `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: 'POST',
        headers: getSupabaseHeaders(key, {
          Prefer: 'resolution=ignore-duplicates,return=representation'
        }),
        body: JSON.stringify(row)
      },
      4500
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (_) {
    return null;
  }
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

const GEMINI_HEAVY_MODELS = [
  { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 8000 },
  { model: 'gemini-flash-latest', thinking: { thinkingBudget: 0 }, timeout: 14000 },
  { model: 'gemini-3.5-flash', thinking: { thinkingBudget: 0 }, timeout: 14000 },
  { model: 'gemini-3.8-flash', thinking: { thinkingBudget: 0 }, timeout: 12000 }
];

const GEMINI_FAST_MODELS = [
  { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 8000 },
  { model: 'gemini-flash-latest', thinking: { thinkingBudget: 0 }, timeout: 10000 },
  { model: 'gemini-3.5-flash', thinking: { thinkingBudget: 0 }, timeout: 10000 }
];

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
        data: { error: { message: `не JSON (${res.status})` } }
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

function extractJson(rawText) {
  const cleaned = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  const tryParse = (str) => {
    try {
      return JSON.parse(str);
    } catch (_) {
      return JSON.parse(str.replace(/,\s*([}\]])/g, '$1'));
    }
  };

  try {
    return tryParse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return tryParse(cleaned.slice(start, end + 1));
    }
    throw new Error('ИИ вернул ответ в неожиданном формате.');
  }
}

function shortErrorText(msg, status) {
  const clean = String(msg || status || '').replace(/\s+/g, ' ').trim();
  if (/high demand|overloaded|unavailable/i.test(clean) || status === 503) return '503 перегрузка';
  if (status === 404 || /not found|no longer available/i.test(clean)) return '404 недоступна';
  if (status === 429 || /quota|rate limit|resource exhausted/i.test(clean)) return '429 лимит';
  if (status === 401 || /invalid api key|unauthorized/i.test(clean)) return '401 неверный ключ';
  return clean.length > 65 ? clean.slice(0, 65) + '…' : clean;
}

async function runGeminiTask({
  apiKey,
  buildPayload,
  models,
  totalBudgetMs = 24000,
  parseResult
}) {
  if (!apiKey) {
    return { ok: false, errors: ['GEMINI_API_KEY не настроен'] };
  }

  const deadline = Date.now() + totalBudgetMs;
  const errors = [];

  for (const attempt of models) {
    const remaining = deadline - Date.now();
    if (remaining < 2500) break;

    const timeout = Math.min(attempt.timeout, remaining);
    let result = await callGemini(apiKey, attempt.model, buildPayload(attempt.thinking), timeout);

    if (!result.ok && result.status === 400 && attempt.thinking) {
      const rem2 = deadline - Date.now();
      if (rem2 >= 2500) {
        result = await callGemini(apiKey, attempt.model, buildPayload(null), Math.min(timeout, rem2));
      }
    }

    if (!result.ok) {
      errors.push(`${attempt.model}: ${shortErrorText(result.data?.error?.message, result.status)}`);
      continue;
    }

    try {
      const parts = result.data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
      const rawText = textPart?.text || '';
      if (!rawText) {
        errors.push(`${attempt.model}: пустой ответ`);
        continue;
      }

      const parsed = extractJson(rawText);
      const value = parseResult ? parseResult(parsed) : parsed;
      if (value) {
        return { ok: true, value, model: attempt.model };
      }
      errors.push(`${attempt.model}: неполный ответ`);
    } catch (_) {
      errors.push(`${attempt.model}: ошибка формата`);
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
  if (req.method === 'GET') {
    const t0 = Date.now();
    const cfg = getSupabaseConfig();
    if (!cfg.enabled) {
      return res.status(200).json({
        ok: false,
        reason: 'missing_env',
        hasUrl: Boolean(cfg.url),
        hasKey: Boolean(cfg.key),
        supabaseEnvNames: Object.keys(process.env).filter(k => k.toUpperCase().includes('SUP'))
      });
    }
    try {
      const r = await fetchWithTimeout(
        `${cfg.url}/rest/v1/grammar_lessons?select=id,language,level,topic_key&limit=5`,
        { method: 'GET', headers: getSupabaseHeaders(cfg.key) },
        4500
      );
      const body = await r.text();
      return res.status(200).json({
        ok: r.ok,
        status: r.status,
        ms: Date.now() - t0,
        urlHost: cfg.url.replace(/^https?:\/\//, ''),
        keyPrefix: cfg.key.slice(0, 10),
        sample: body.slice(0, 300)
      });
    } catch (e) {
      return res.status(200).json({ ok: false, ms: Date.now() - t0, error: e?.message || 'fetch_error' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается.' });
  }
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const supabaseEnabled = getSupabaseConfig().enabled;

  if (!apiKey && !supabaseEnabled) {
    return res.status(500).json({ error: 'На сервере не настроены ключи ИИ или базы данных.' });
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
      history = [],
      seenIds = []
    } = req.body || {};

    const langCode = LANGUAGE_META[language] ? language : 'en';
    const lang = LANGUAGE_META[langCode];
    const levelDesc = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.B1;
    const clientSeenIds = Array.isArray(seenIds)
      ? seenIds.filter(x => typeof x === 'string' && x.length > 0).slice(-100)
      : [];

    // 1. Быстрый перевод слова или фразы (сначала из кэша Supabase)
    if (action === 'translate') {
      const cleanWord = String(word || '').trim().slice(0, 200);
      const cleanCtx = String(context || '').trim().slice(0, 400);
      if (!cleanWord) {
        return res.status(400).json({ error: 'Не указано слово для перевода.' });
      }

      const wordKey = normalizeKey(cleanWord);
      const cachedRows = await supabaseSelect(
        'translations_cache',
        `language=eq.${encodeURIComponent(langCode)}&word_key=eq.${encodeURIComponent(wordKey)}&select=translation,note&limit=1`
      );
      if (cachedRows.length > 0 && cachedRows[0].translation) {
        return res.status(200).json({
          translation: cachedRows[0].translation,
          note: cachedRows[0].note || '',
          fromCache: true
        });
      }

      const trPrompt = `
Translate the ${lang.enName} word or phrase "${cleanWord}" into Russian${cleanCtx ? ` as used in the sentence: "${cleanCtx}"` : ''}.
Give a concise Russian translation (1-3 words) in "translation", and a very short usage note or reading hint in "note" (max 12 words, or empty string).
${lang.scriptHint || ''}
`.trim();

      const task = await runGeminiTask({
        apiKey,
        models: GEMINI_FAST_MODELS,
        totalBudgetMs: 16000,
        buildPayload: (thinkingConfig) => ({
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

      if (task.value.translation && cleanWord.length <= 60) {
        await supabaseInsertIgnore('translations_cache', 'language,word_key', {
          language: langCode,
          word_key: wordKey,
          translation: task.value.translation,
          note: task.value.note || ''
        });
      }

      return res.status(200).json(task.value);
    }

    // 2. Урок и задания по грамматике (сначала из Supabase, новые сохраняются автоматически)
    if (action === 'grammar_lesson') {
      const targetTopic = String(grammarTopic || '').trim().slice(0, 140) || 'Базовая грамматика';
      const topicKey = normalizeKey(targetTopic);

      const cachedLessons = await supabaseSelect(
        'grammar_lessons',
        `language=eq.${encodeURIComponent(langCode)}&level=eq.${encodeURIComponent(level)}&topic_key=eq.${encodeURIComponent(topicKey)}&select=id,content&limit=1`
      );
      if (cachedLessons.length > 0 && cachedLessons[0].content) {
        return res.status(200).json({
          id: cachedLessons[0].id,
          ...cachedLessons[0].content,
          fromCache: true
        });
      }

      const grammarPrompt = `
You are Echo, a clear, practical ${lang.enName} grammar tutor for Russian learners.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Grammar topic: "${targetTopic}"
${lang.extraNote}

Create a concise, clear grammar lesson in Russian for level ${level}:
1. "topicTitle": clear title (${lang.enName} term + Russian explanation).
2. "whenToUseRu": 3 short bullet points in Russian explaining main situations when this grammar is used.
3. "sections": 3 structured blocks covering key parts of the topic (structure/affirmative, negative/questions/exceptions, key nuances). Each has:
   * "headingRu": short Russian heading
   * "formula": short pattern (or "")
   * "explanationRu": clear 1-2 sentence Russian explanation
   * "examples": 1-2 short natural examples in ${lang.enName} ("target") with Russian translation ("ru").
4. "markers": 3-4 signal words/phrases in ${lang.enName} with short Russian translations.
5. "commonMistakes": 2 typical mistakes Russian speakers make, each with "wrongTarget", "rightTarget", and a short "explanationRu".
6. "exercises": 4 exercises in ${lang.enName} (first 2: "type": "choice" with 4 distinct "options"; last 2: "type": "input" with "options": [] and a short "hint"). Each has "promptRu", "sentence" with "___", exact "answer", "fullSentence", "translationRu", and brief "explanationRu".
- No markdown symbols (*, **, #) and no emojis.
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

      const task = await runGeminiTask({
        apiKey,
        models: GEMINI_HEAVY_MODELS,
        totalBudgetMs: 24000,
        buildPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: grammarPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2600,
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

      const saved = await supabaseInsertIgnore('grammar_lessons', 'language,level,topic_key', {
        language: langCode,
        level,
        topic_title: targetTopic,
        topic_key: topicKey,
        content: task.value
      });

      return res.status(200).json({
        id: saved?.id || null,
        ...task.value
      });
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

Answer clearly and thoroughly in Russian (2-5 sentences, easy to understand, no markdown).
Also give one helpful example sentence in ${lang.enName} ("exampleTarget") and its Russian translation ("exampleRu").
`.trim();

      const task = await runGeminiTask({
        apiKey,
        models: GEMINI_FAST_MODELS,
        totalBudgetMs: 18000,
        buildPayload: (thinkingConfig) => ({
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

    // 4. Адаптированный текст для «Чтения» (выдача без повторов из Supabase + автопополнение)
    if (action === 'reading') {
      const hasCustom = Boolean(String(customTopic || '').trim());
      const finalTopic = String(customTopic || '').trim().slice(0, 120) || topic;
      const bucket = `reading:${langCode}:${level}:${normalizeKey(finalTopic)}`;

      const dbTexts = await supabaseSelect(
        'reading_texts',
        `language=eq.${encodeURIComponent(langCode)}&level=eq.${encodeURIComponent(level)}&topic=eq.${encodeURIComponent(finalTopic)}&select=id,content&order=created_at.asc&limit=100`
      );

      const serverSeen = getSeenList(clientIp, bucket);
      const seenSet = new Set([...serverSeen, ...clientSeenIds]);
      const unseenTexts = dbTexts.filter(row => row.content && !seenSet.has(row.id));

      if (unseenTexts.length > 0) {
        const chosen = pickRandom(unseenTexts);
        markSeenId(clientIp, bucket, chosen.id);
        return res.status(200).json({
          id: chosen.id,
          ...chosen.content,
          fromCache: true
        });
      }

      // Все тексты в библиотеке прочитаны или тема новая — пробуем сгенерировать новый
      const styles = [
        'a short relatable story from everyday life',
        'an interesting mini-article with surprising facts',
        'a vivid diary entry about a memorable day',
        'a light practical guide or life observation'
      ];
      const chosenStyle = pickRandom(styles);
      const existingTitles = dbTexts
        .map(r => r?.content?.titleTarget)
        .filter(Boolean)
        .slice(-8)
        .join(', ');

      const readingPrompt = `
Write ${chosenStyle} strictly in ${lang.enName}, adapted for a Russian learner at level: ${levelDesc}
Topic: "${finalTopic}".
${existingTitles ? `Do NOT repeat or closely copy these already existing titles/ideas: ${existingTitles}. Create a completely different angle.` : ''}
${lang.extraNote}

Requirements:
- Write 2 short paragraphs (total 5 to 7 natural sentences) strictly in ${lang.enName}.
- Use vocabulary and grammar appropriate for ${level}, including useful everyday words worth learning.
- For each sentence, include its paragraph number in "p" (1 or 2), the sentence in ${lang.enName} in "target", and an accurate, natural Russian translation in "ru".
- No markdown, no emojis.
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

      const task = await runGeminiTask({
        apiKey,
        models: GEMINI_HEAVY_MODELS,
        totalBudgetMs: 24000,
        buildPayload: (thinkingConfig) => ({
          contents: [{ role: 'user', parts: [{ text: readingPrompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2000,
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

      if (task.ok) {
        const firstLine = task.value.paragraphs?.[0]?.[0]?.target || '';
        const contentKey = normalizeKey(`${task.value.titleTarget} ${firstLine}`);
        const saved = await supabaseInsertIgnore('reading_texts', 'language,level,content_key', {
          language: langCode,
          level,
          topic: finalTopic,
          title_target: task.value.titleTarget,
          content_key: contentKey,
          content: task.value
        });
        if (saved?.id) markSeenId(clientIp, bucket, saved.id);
        return res.status(200).json({
          id: saved?.id || null,
          ...task.value
        });
      }

      // Мягкая страховка: если ИИ перегружен, но в базе уже есть тексты — начинаем новый круг без повтора последнего
      if (dbTexts.length > 0) {
        const lastId = serverSeen[serverSeen.length - 1];
        const pool = dbTexts.length > 1 ? dbTexts.filter(r => r.id !== lastId) : dbTexts;
        const chosen = pickRandom(pool);
        resetSeenKeepLast(clientIp, bucket, chosen.id);
        return res.status(200).json({
          id: chosen.id,
          ...chosen.content,
          fromCache: true
        });
      }

      // Если для выбранного уровня текстов нет, но это стандартная тема — подстрахуем текстом того же языка
      if (!hasCustom) {
        const anyLevelTexts = await supabaseSelect(
          'reading_texts',
          `language=eq.${encodeURIComponent(langCode)}&select=id,content&limit=30`
        );
        if (anyLevelTexts.length > 0) {
          const chosen = pickRandom(anyLevelTexts);
          return res.status(200).json({
            id: chosen.id,
            ...chosen.content,
            fromCache: true
          });
        }
      }

      return res.status(502).json({
        error: formatOverloadError('Не удалось создать текст.', task.errors)
      });
    }

    // 5. Разнообразный старт диалога (без повторов из Supabase + автопополнение)
    if (action === 'start') {
      const bucket = `start:${langCode}:${level}:${normalizeKey(topic)}`;

      let dbStarters = await supabaseSelect(
        'dialog_starters',
        `language=eq.${encodeURIComponent(langCode)}&level=eq.${encodeURIComponent(level)}&topic=eq.${encodeURIComponent(topic)}&select=id,reply_target,reply_ru&limit=100`
      );

      if (dbStarters.length === 0) {
        dbStarters = await supabaseSelect(
          'dialog_starters',
          `language=eq.${encodeURIComponent(langCode)}&topic=eq.${encodeURIComponent(topic)}&select=id,reply_target,reply_ru&limit=100`
        );
      }

      const serverSeen = getSeenList(clientIp, bucket);
      const seenSet = new Set([...serverSeen, ...clientSeenIds]);
      const unseenStarters = dbStarters.filter(r => r.reply_target && !seenSet.has(r.id));

      if (unseenStarters.length > 0) {
        const chosen = pickRandom(unseenStarters);
        markSeenId(clientIp, bucket, chosen.id);
        return res.status(200).json({
          id: chosen.id,
          userTranscript: '',
          hasErrors: false,
          correction: '',
          explanationRu: '',
          replyTarget: chosen.reply_target,
          replyRu: chosen.reply_ru,
          fromCache: true
        });
      }

      const seeds = SCENARIO_SEEDS[topic] || SCENARIO_SEEDS['Свободная тема'];
      const chosenSeed = pickRandom(seeds);

      const startPrompt = `
You are Echo, a friendly spoken ${lang.enName} tutor.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Topic: "${topic}"
Opening scenario: ${chosenSeed}
${lang.extraNote}

Write a fresh, natural opening message STRICTLY in ${lang.enName} ("replyTarget", 1-2 short sentences ending with an engaging question) and its natural Russian translation ("replyRu").
Avoid cliché textbook openings — jump right into the vibe of the scenario!
No markdown or emojis.
`.trim();

      const task = await runGeminiTask({
        apiKey,
        models: GEMINI_FAST_MODELS,
        totalBudgetMs: 14000,
        buildPayload: (thinkingConfig) => ({
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
        const saved = await supabaseInsertIgnore('dialog_starters', 'language,level,content_key', {
          language: langCode,
          level,
          topic,
          reply_target: task.value.replyTarget,
          reply_ru: task.value.replyRu,
          content_key: normalizeKey(task.value.replyTarget)
        });
        if (saved?.id) markSeenId(clientIp, bucket, saved.id);
        return res.status(200).json({
          id: saved?.id || null,
          ...task.value
        });
      }

      if (dbStarters.length > 0) {
        const lastId = serverSeen[serverSeen.length - 1];
        const pool = dbStarters.length > 1 ? dbStarters.filter(r => r.id !== lastId) : dbStarters;
        const chosen = pickRandom(pool);
        resetSeenKeepLast(clientIp, bucket, chosen.id);
        return res.status(200).json({
          id: chosen.id,
          userTranscript: '',
          hasErrors: false,
          correction: '',
          explanationRu: '',
          replyTarget: chosen.reply_target,
          replyRu: chosen.reply_ru,
          fromCache: true
        });
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
1. Transcribe accurately what the student said in ${lang.enName} in "userTranscript".
2. If there are grammar, word choice, or phrasing mistakes, set "hasErrors": true, give a natural corrected version in ${lang.enName} in "correction", and explain briefly in Russian (1-2 sentences) in "explanationRu". Otherwise set "hasErrors": false, "correction": "", and write short praise in Russian in "explanationRu".
3. Reply naturally STRICTLY in ${lang.enName} in "replyTarget" (1-2 short sentences + a light follow-up question, no markdown or emojis) and translate it into Russian in "replyRu".
`.trim();

    const contents = [];
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    if (safeHistory.length > 0 && safeHistory[0].role === 'model') {
      contents.push({
        role: 'user',
        parts: [{ text: `Let's practice ${lang.enName} on the topic "${topic}".` }]
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
      userParts.push({ text: `Listen to the student audio in ${lang.enName}, transcribe it, check for mistakes, and respond.` });
      userParts.push({ inline_data: { mime_type: cleanMime, data: audioBase64 } });
    } else {
      userParts.push({ text: `Student message in ${lang.enName}: "${String(text).trim().slice(0, 800)}". Check for mistakes and respond.` });
    }

    contents.push({ role: 'user', parts: userParts });

    const task = await runGeminiTask({
      apiKey,
      models: GEMINI_HEAVY_MODELS,
      totalBudgetMs: 26000,
      buildPayload: (thinkingConfig) => ({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 750,
          responseMimeType: 'application/json',
          responseSchema: {
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
          },
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      }),
      parseResult: (parsed) => ({
        userTranscript: String(parsed.userTranscript || text || '').trim(),
        hasErrors: Boolean(parsed.hasErrors),
        correction: String(parsed.correction || '').trim(),
        explanationRu: String(parsed.explanationRu || '').trim(),
        replyTarget: String(parsed.replyTarget || parsed.replyEn || '...').trim(),
        replyRu: String(parsed.replyRu || '').trim()
      })
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
