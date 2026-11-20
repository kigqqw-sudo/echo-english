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

const LEVEL_GUIDANCE = {
  A1: 'Beginner (A1). Use very simple words, short sentences (5-10 words), present/past simple tenses.',
  A2: 'Elementary (A2). Use everyday vocabulary and clear, short sentences.',
  B1: 'Intermediate (B1). Use natural everyday English, phrasal verbs sparingly, clear conversational flow.',
  B2: 'Upper-Intermediate (B2). Use natural idioms, varied grammar, and engaging conversational phrasing.',
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

const FALLBACK_STARTERS = {
  'Свободная тема': {
    easy: [
      { en: 'Hi! Are you a morning person or a night person?', ru: 'Привет! Ты жаворонок или сова?' },
      { en: 'Hey! What is the best food you ate this week?', ru: 'Привет! Какую самую вкусную еду ты ел на этой неделе?' },
      { en: 'Hi! If you have free time today, what will you do?', ru: 'Привет! Если у тебя сегодня будет свободное время, чем займёшься?' }
    ],
    mid: [
      { en: 'Hey! Quick question: would you rather live by the sea or in a big city?', ru: 'Привет! Быстрый вопрос: ты бы предпочёл жить у моря или в большом городе?' },
      { en: 'Hi there! What is one small thing that made your week better so far?', ru: 'Привет! Какая мелочь сделала твою неделю лучше?' },
      { en: 'Hey! If you could instantly learn any new skill today, what would you pick?', ru: 'Привет! Если бы ты мог мгновенно освоить любой навык сегодня, что бы ты выбрал?' }
    ]
  },
  'Путешествия': {
    easy: [
      { en: 'Hi! Do you like traveling by train, car, or plane?', ru: 'Привет! Тебе нравится путешествовать на поезде, машине или самолёте?' },
      { en: 'Hey! What country do you really want to visit one day?', ru: 'Привет! Какую страну ты очень хочешь посетить однажды?' }
    ],
    mid: [
      { en: 'Imagine you got a free plane ticket for tomorrow. Where are you flying?', ru: 'Представь, что тебе подарили бесплатный билет на самолёт на завтра. Куда полетишь?' },
      { en: 'Hey! Do you prefer planning every detail of a trip or just going with the flow?', ru: 'Привет! Ты предпочитаешь планировать каждую деталь поездки или действовать по ситуации?' }
    ]
  },
  'В кафе и ресторане': {
    easy: [
      { en: 'Hello! Welcome in. Would you like coffee, tea, or something cold?', ru: 'Здравствуйте! Добро пожаловать. Хотите кофе, чай или что-нибудь холодное?' },
      { en: 'Hi! We have fresh croissants today. What would you like to order?', ru: 'Привет! У нас сегодня свежие круассаны. Что будете заказывать?' }
    ],
    mid: [
      { en: 'Welcome in! It is pretty chilly outside — can I get you a hot drink or a table by the window?', ru: 'Добро пожаловать! На улице довольно прохладно — принести горячий напиток или проводить за столик у окна?' },
      { en: 'Hi there! Our chef made a special pasta today, or are you in the mood for something lighter?', ru: 'Привет! Наш шеф сегодня приготовил особую пасту, или вы настроены на что-то полегче?' }
    ]
  },
  'Работа и карьера': {
    easy: [
      { en: 'Hi! Do you like working alone or with other people?', ru: 'Привет! Тебе нравится работать одному или с другими людьми?' },
      { en: 'Hey! What is your dream job?', ru: 'Привет! Какая у тебя работа мечты?' }
    ],
    mid: [
      { en: 'Hey! If money was not an issue at all, what kind of work would you still enjoy doing?', ru: 'Привет! Если бы деньги вообще не имели значения, чем бы тебе всё равно нравилось заниматься?' },
      { en: 'Hi! Are you more productive working from home or in an office around other people?', ru: 'Привет! Ты продуктивнее работаешь из дома или в офисе среди людей?' }
    ]
  },
  'Хобби и фильмы': {
    easy: [
      { en: 'Hi! What is your favorite movie or TV show?', ru: 'Привет! Какой твой любимый фильм или сериал?' },
      { en: 'Hey! Do you play video games or sports in your free time?', ru: 'Привет! Ты играешь в видеоигры или занимаешься спортом в свободное время?' }
    ],
    mid: [
      { en: 'Hey! I need a good movie for tonight — what is something you watched recently and loved?', ru: 'Привет! Мне нужен хороший фильм на вечер — что ты недавно смотрел и тебе понравилось?' },
      { en: 'Hi! Is there a hobby you have always wanted to try but never got around to?', ru: 'Привет! Есть хобби, которое ты всегда хотел попробовать, но никак не доходили руки?' }
    ]
  },
  'Собеседование на работу': {
    easy: [
      { en: 'Hello! Nice to meet you. What do you like doing most in your work or studies?', ru: 'Здравствуйте! Приятно познакомиться. Что вам больше всего нравится в работе или учёбе?' },
      { en: 'Hi! Thanks for coming. What are two of your best skills?', ru: 'Привет! Спасибо, что пришли. Какие два ваших главных навыка?' }
    ],
    mid: [
      { en: 'Hello, thanks for joining me! What caught your eye about this role?', ru: 'Здравствуйте, спасибо, что присоединились! Что вас заинтересовало в этой позиции?' },
      { en: 'Nice to meet you! Could you tell me about a recent project or challenge you are proud of?', ru: 'Приятно познакомиться! Расскажите о недавнем проекте или задаче, которой вы гордитесь?' }
    ]
  }
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

function getFallbackStarter(topic, level) {
  const bucket = FALLBACK_STARTERS[topic] || FALLBACK_STARTERS['Свободная тема'];
  const list = (level === 'A1' || level === 'A2') ? bucket.easy : bucket.mid;
  return pickRandom(list);
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
      error: 'Превышен лимит запросов в час. Попробуйте снова немного позже.'
    });
  }

  try {
    const {
      action = 'message',
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

    const levelDesc = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.B1;

    // 1. Быстрый перевод слова или фразы в контексте
    if (action === 'translate') {
      const cleanWord = String(word || '').trim().slice(0, 200);
      const cleanCtx = String(context || '').trim().slice(0, 400);
      if (!cleanWord) {
        return res.status(400).json({ error: 'Не указано слово для перевода.' });
      }

      const trPrompt = `
Translate the English word or phrase "${cleanWord}" into Russian${cleanCtx ? ` as used in the sentence: "${cleanCtx}"` : ''}.
Give a concise Russian translation (1-3 words) and a very short usage note or example (max 10 words, or empty string).
`.trim();

      const buildTrPayload = (thinkingConfig) => ({
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
      });

      let trRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildTrPayload({ thinkingBudget: 0 }), 7000);
      if (!trRes.ok && trRes.status === 400) {
        trRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildTrPayload(null), 6000);
      }

      if (!trRes.ok) {
        return res.status(502).json({ error: 'Не удалось перевести слово. Введите перевод вручную.' });
      }

      const parts = trRes.data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
      const parsed = extractJson(textPart?.text || '{}');

      return res.status(200).json({
        translation: parsed.translation || '',
        note: parsed.note || ''
      });
    }

    // 2. Урок и задания по грамматике
    if (action === 'grammar_lesson') {
      const targetTopic = String(grammarTopic || '').trim().slice(0, 140) || 'Present Simple';

      const grammarPrompt = `
You are Echo, a clear, friendly English grammar tutor for Russian-speaking learners.
Student level: ${levelDesc}
Grammar topic: "${targetTopic}"

Create a concise mini-lesson and 5 fresh practice exercises strictly matching level ${level}:
1. "topicTitle": clear title (English + Russian).
2. "summaryRu": short, crystal-clear explanation of the rule in Russian (2-4 sentences, no textbook fluff).
3. "formula": concise structure formula (e.g. "Subject + have/has + V3" or "a/an + singular countable").
4. "tipRu": one practical tip or common mistake Russian speakers make (1-2 sentences in Russian).
5. "examples": 3 natural everyday English examples with Russian translations.
6. "exercises": exactly 5 varied exercises:
   - First 3 exercises must have "type": "choice" with exactly 4 distinct options in "options" (one of which is the exact "answer").
   - Last 2 exercises must have "type": "input" where the student types 1-3 words to fill the blank "___" (provide the base verb or clue in "hint", e.g. "go" or "not / see", and set "options": []).
   - Each exercise MUST have "sentence" containing "___" for the gap, exact "answer" string that replaces "___", "fullSentence" (the complete correct English sentence), "translationRu" (Russian translation), and "explanationRu" (1-2 short sentences in Russian explaining WHY this answer is correct).
   - No markdown, no emojis.
`.trim();

      const grammarSchema = {
        type: 'OBJECT',
        properties: {
          topicTitle: { type: 'STRING' },
          summaryRu: { type: 'STRING' },
          formula: { type: 'STRING' },
          tipRu: { type: 'STRING' },
          examples: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                en: { type: 'STRING' },
                ru: { type: 'STRING' }
              },
              required: ['en', 'ru']
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
        required: ['topicTitle', 'summaryRu', 'formula', 'tipRu', 'examples', 'exercises']
      };

      const buildGrammarPayload = (thinkingConfig) => ({
        contents: [{ role: 'user', parts: [{ text: grammarPrompt }] }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 2800,
          responseMimeType: 'application/json',
          responseSchema: grammarSchema,
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      });

      const attempts = [
        { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 16000 },
        { model: 'gemini-3.5-flash-lite', thinking: null, timeout: 12000 }
      ];

      const errors = [];

      for (const attempt of attempts) {
        let result = await callGemini(apiKey, attempt.model, buildGrammarPayload(attempt.thinking), attempt.timeout);
        if (!result.ok && result.status === 400 && attempt.thinking) {
          result = await callGemini(apiKey, attempt.model, buildGrammarPayload(null), attempt.timeout);
        }

        if (!result.ok) {
          errors.push(`${attempt.model}: ${result.data?.error?.message || result.status}`);
          continue;
        }

        try {
          const parts = result.data?.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
          const parsed = extractJson(textPart?.text || '');

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

          if (cleanExercises.length > 0) {
            return res.status(200).json({
              topicTitle: String(parsed.topicTitle || targetTopic).trim(),
              summaryRu: String(parsed.summaryRu || '').trim(),
              formula: String(parsed.formula || '').trim(),
              tipRu: String(parsed.tipRu || '').trim(),
              examples: (Array.isArray(parsed.examples) ? parsed.examples : [])
                .filter(e => e && e.en)
                .map(e => ({ en: String(e.en).trim(), ru: String(e.ru || '').trim() })),
              exercises: cleanExercises
            });
          }
          errors.push('пустой список заданий');
        } catch (_) {
          errors.push('ошибка разбора JSON');
        }
      }

      return res.status(502).json({
        error: 'Не удалось составить урок. Попробуйте нажать ещё раз. (' + errors.join(' | ') + ')'
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
You are Echo, a friendly English grammar tutor for Russian learners.
Student level: ${levelDesc}
Current grammar topic: "${targetTopic || 'Общая грамматика'}"
Student question: "${cleanQ}"

Answer clearly and concisely in Russian (2-4 sentences, easy to understand, no markdown).
Also give one helpful English example sentence illustrating your answer and its Russian translation.
`.trim();

      const buildAskPayload = (thinkingConfig) => ({
        contents: [{ role: 'user', parts: [{ text: askPrompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 450,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              answerRu: { type: 'STRING' },
              exampleEn: { type: 'STRING' },
              exampleRu: { type: 'STRING' }
            },
            required: ['answerRu', 'exampleEn', 'exampleRu']
          },
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      });

      let askRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildAskPayload({ thinkingBudget: 0 }), 9000);
      if (!askRes.ok && askRes.status === 400) {
        askRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildAskPayload(null), 8000);
      }

      if (!askRes.ok) {
        return res.status(502).json({ error: 'Не удалось получить ответ. Попробуйте ещё раз.' });
      }

      const parts = askRes.data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
      const parsed = extractJson(textPart?.text || '{}');

      return res.status(200).json({
        answerRu: String(parsed.answerRu || '').trim(),
        exampleEn: String(parsed.exampleEn || '').trim(),
        exampleRu: String(parsed.exampleRu || '').trim()
      });
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
Write ${chosenStyle} in English strictly adapted for a Russian learner at level: ${levelDesc}
Topic: "${finalTopic}".

Requirements:
- Write 2 or 3 short paragraphs (total 6 to 9 natural sentences).
- Use vocabulary and grammar appropriate for ${level}, including a few useful everyday words worth learning.
- For each sentence, include its paragraph number in "p" (1, 2, or 3), the English sentence in "en", and an accurate, natural Russian translation in "ru".
- No markdown, no emojis.
`.trim();

      const readingSchema = {
        type: 'OBJECT',
        properties: {
          titleEn: { type: 'STRING' },
          titleRu: { type: 'STRING' },
          sentences: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                p: { type: 'INTEGER' },
                en: { type: 'STRING' },
                ru: { type: 'STRING' }
              },
              required: ['p', 'en', 'ru']
            }
          }
        },
        required: ['titleEn', 'titleRu', 'sentences']
      };

      const buildReadPayload = (thinkingConfig) => ({
        contents: [{ role: 'user', parts: [{ text: readingPrompt }] }],
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 2400,
          responseMimeType: 'application/json',
          responseSchema: readingSchema,
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      });

      const attempts = [
        { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 14000 },
        { model: 'gemini-3.5-flash-lite', thinking: null, timeout: 12000 }
      ];

      const errors = [];

      for (const attempt of attempts) {
        let result = await callGemini(apiKey, attempt.model, buildReadPayload(attempt.thinking), attempt.timeout);
        if (!result.ok && result.status === 400 && attempt.thinking) {
          result = await callGemini(apiKey, attempt.model, buildReadPayload(null), attempt.timeout);
        }

        if (!result.ok) {
          errors.push(`${attempt.model}: ${result.data?.error?.message || result.status}`);
          continue;
        }

        try {
          const parts = result.data?.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
          const parsed = extractJson(textPart?.text || '');

          const rawSentences = Array.isArray(parsed.sentences) ? parsed.sentences : [];
          const groupedMap = new Map();

          for (const s of rawSentences) {
            if (!s || typeof s.en !== 'string' || !s.en.trim()) continue;
            const pNum = Number.isFinite(Number(s.p)) ? Number(s.p) : 1;
            if (!groupedMap.has(pNum)) groupedMap.set(pNum, []);
            groupedMap.get(pNum).push({
              en: s.en.trim(),
              ru: String(s.ru || '').trim()
            });
          }

          const cleanParagraphs = Array.from(groupedMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, list]) => list)
            .filter(list => list.length > 0);

          if (cleanParagraphs.length > 0) {
            return res.status(200).json({
              titleEn: String(parsed.titleEn || finalTopic).trim(),
              titleRu: String(parsed.titleRu || '').trim(),
              paragraphs: cleanParagraphs
            });
          }
          errors.push('пустой список предложений');
        } catch (_) {
          errors.push('ошибка разбора JSON');
        }
      }

      return res.status(502).json({
        error: 'Не удалось создать текст, попробуйте нажать «Новый текст» ещё раз. (' + errors.join(' | ') + ')'
      });
    }

    // 5. Разнообразный старт диалога
    if (action === 'start') {
      const seeds = SCENARIO_SEEDS[topic] || SCENARIO_SEEDS['Свободная тема'];
      const chosenSeed = pickRandom(seeds);

      const startPrompt = `
You are Echo, a friendly spoken English tutor.
Student level: ${levelDesc}
Topic: "${topic}"
Opening scenario: ${chosenSeed}

Write a fresh, natural opening message in English (1-2 short sentences ending with an engaging question) and its natural Russian translation.
Avoid cliché openings like "Hi! I am Echo. How are you today?" — jump right into the vibe of the scenario!
No markdown or emojis.
`.trim();

      const buildStartPayload = (thinkingConfig) => ({
        contents: [{ role: 'user', parts: [{ text: startPrompt }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              replyEn: { type: 'STRING' },
              replyRu: { type: 'STRING' }
            },
            required: ['replyEn', 'replyRu']
          },
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      });

      let startRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildStartPayload({ thinkingBudget: 0 }), 6000);
      if (!startRes.ok && startRes.status === 400) {
        startRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildStartPayload(null), 5000);
      }

      if (startRes.ok) {
        try {
          const parts = startRes.data?.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
          const parsed = extractJson(textPart?.text || '');
          if (parsed.replyEn) {
            return res.status(200).json({
              userTranscript: '',
              hasErrors: false,
              correction: '',
              explanationRu: '',
              replyEn: parsed.replyEn,
              replyRu: parsed.replyRu || ''
            });
          }
        } catch (_) {}
      }

      const fallback = getFallbackStarter(topic, level);
      return res.status(200).json({
        userTranscript: '',
        hasErrors: false,
        correction: '',
        explanationRu: '',
        replyEn: fallback.en,
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
You are Echo, a friendly spoken English tutor for Russian-speaking learners.
Student level: ${levelDesc}
Topic: "${topic}".

On every message:
1. Transcribe accurately what the student said in English in "userTranscript".
2. If there are grammar, word choice, or phrasing mistakes, set "hasErrors": true, give a natural corrected version in "correction", and explain briefly in Russian (1-2 sentences) in "explanationRu". Otherwise set "hasErrors": false, "correction": "", and write short praise in Russian in "explanationRu".
3. Reply naturally in English in "replyEn" (1-2 short sentences + a light follow-up question, no markdown or emojis) and translate it into Russian in "replyRu".
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
      userParts.push({ text: 'Listen to the student audio, transcribe it, check for mistakes, and respond.' });
      userParts.push({ inline_data: { mime_type: cleanMime, data: audioBase64 } });
    } else {
      userParts.push({ text: `Student message: "${String(text).trim().slice(0, 800)}". Check for mistakes and respond.` });
    }

    contents.push({ role: 'user', parts: userParts });

    const buildPayload = (thinkingConfig) => ({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 700,
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
        },
        ...(thinkingConfig ? { thinkingConfig } : {})
      }
    });

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
