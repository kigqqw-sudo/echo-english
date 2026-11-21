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
Give a concise Russian translation (1-3 words) in "translation", and a very short usage note or reading hint in "note" (max 12 words, or empty string).
${lang.scriptHint || ''}
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

    // 2. Подробный урок и задания по грамматике
    if (action === 'grammar_lesson') {
      const targetTopic = String(grammarTopic || '').trim().slice(0, 140) || 'Базовая грамматика';

      const grammarPrompt = `
You are Echo, an expert, super-clear ${lang.enName} grammar tutor for Russian-speaking learners.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Grammar topic: "${targetTopic}"
${lang.extraNote}

Create a thorough, comprehensive, easy-to-understand grammar guide in Russian covering the ENTIRE topic in ${lang.enName} (never leave out negative forms, questions, or key rules!), plus 5 interactive exercises strictly suited to level ${level}:

1. "topicTitle": clear title (${lang.enName} term + Russian explanation).
2. "whenToUseRu": 3-4 concise bullet points in plain Russian explaining all main situations when this grammar is used in real life.
3. "sections": 3 to 4 detailed sub-sections covering EVERY major part of the topic:
   - If the topic is a tense or verb construction, include separate sections for:
     (1) Утверждение (+)
     (2) Отрицание (−)
     (3) Вопросы (?) и ответы
     (4) Важные правила, окончания и нюансы.
   - If the topic is non-tense (articles, cases, particles, prepositions, conditionals, modals, etc.), break it into 3-4 complete logical blocks covering all core cases and exceptions.
   - For EACH section provide:
     * "headingRu": clear Russian heading
     * "formula": clear compact formula (or empty string if not applicable)
     * "explanationRu": thorough, friendly explanation in plain Russian (2-4 sentences, no dry academic jargon)
     * "examples": 2-3 natural everyday examples in ${lang.enName} ("target") with Russian translation ("ru").
4. "markers": 4 to 7 helpful signal words, particles, or trigger phrases in ${lang.enName} with short Russian translations.
5. "commonMistakes": 2 to 3 typical mistakes Russian speakers make on this topic in ${lang.enName}, each with "wrongTarget", "rightTarget", and a short clear "explanationRu".
6. "exercises": exactly 5 varied exercises in ${lang.enName} testing DIFFERENT aspects of the topic (mix affirmative, negative, questions, and tricky cases!):
   - First 3 exercises: "type": "choice" with exactly 4 distinct options in "options" in ${lang.enName} (one is the exact "answer").
   - Last 2 exercises: "type": "input" where the student types 1-3 words in ${lang.enName} for the gap "___" (give a clear cue in "hint" and set "options": []).
   - Every exercise MUST include "sentence" in ${lang.enName} containing "___", exact "answer" in ${lang.enName}, "fullSentence" in ${lang.enName}, "translationRu", and "explanationRu" (1-2 clear sentences in Russian explaining why).
   - No markdown symbols (no *, **, #) and no emojis anywhere.
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

      const buildGrammarPayload = (thinkingConfig) => ({
        contents: [{ role: 'user', parts: [{ text: grammarPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4500,
          responseMimeType: 'application/json',
          responseSchema: grammarSchema,
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      });

      const attempts = [
        { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 19000 },
        { model: 'gemini-3.5-flash-lite', thinking: null, timeout: 9000 }
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

          const cleanSections = (Array.isArray(parsed.sections) ? parsed.sections : [])
            .filter(s => s && (s.headingRu || s.explanationRu))
            .map(s => ({
              headingRu: String(s.headingRu || '').trim(),
              formula: String(s.formula || '').trim(),
              explanationRu: String(s.explanationRu || '').trim(),
              examples: (Array.isArray(s.examples) ? s.examples : [])
                .filter(e => e && e.target)
                .map(e => ({ target: String(e.target).trim(), ru: String(e.ru || '').trim() }))
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

          if (cleanSections.length > 0 && cleanExercises.length > 0) {
            return res.status(200).json({
              topicTitle: String(parsed.topicTitle || targetTopic).trim(),
              whenToUseRu: (Array.isArray(parsed.whenToUseRu) ? parsed.whenToUseRu : [])
                .map(x => String(x || '').trim()).filter(Boolean),
              sections: cleanSections,
              markers: (Array.isArray(parsed.markers) ? parsed.markers : [])
                .map(x => String(x || '').trim()).filter(Boolean),
              commonMistakes: (Array.isArray(parsed.commonMistakes) ? parsed.commonMistakes : [])
                .filter(m => m && m.wrongTarget && m.rightTarget)
                .map(m => ({
                  wrongTarget: String(m.wrongTarget).trim(),
                  rightTarget: String(m.rightTarget).trim(),
                  explanationRu: String(m.explanationRu || '').trim()
                })),
              exercises: cleanExercises
            });
          }
          errors.push('неполный урок');
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
You are Echo, a friendly ${lang.enName} grammar tutor for Russian learners.
Target language: ${lang.enName}.
Student level: ${levelDesc}
Current grammar topic: "${targetTopic || 'Общая грамматика'}"
Student question: "${cleanQ}"
${lang.extraNote}

Answer clearly and thoroughly in Russian (2-5 sentences, easy to understand, no markdown).
Also give one helpful example sentence in ${lang.enName} ("exampleTarget") and its Russian translation ("exampleRu").
`.trim();

      const buildAskPayload = (thinkingConfig) => ({
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
        exampleTarget: String(parsed.exampleTarget || '').trim(),
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
Write ${chosenStyle} strictly in ${lang.enName}, adapted for a Russian learner at level: ${levelDesc}
Topic: "${finalTopic}".
${lang.extraNote}

Requirements:
- Write 2 or 3 short paragraphs (total 6 to 9 natural sentences) strictly in ${lang.enName}.
- Use vocabulary and grammar appropriate for ${level}, including useful everyday words worth learning.
- For each sentence, include its paragraph number in "p" (1, 2, or 3), the sentence in ${lang.enName} in "target", and an accurate, natural Russian translation in "ru".
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
        { model: 'gemini-3.5-flash-lite', thinking: { thinkingBudget: 0 }, timeout: 15000 },
        { model: 'gemini-3.5-flash-lite', thinking: null, timeout: 11000 }
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
            if (!s || typeof s.target !== 'string' || !s.target.trim()) continue;
            const pNum = Number.isFinite(Number(s.p)) ? Number(s.p) : 1;
            if (!groupedMap.has(pNum)) groupedMap.set(pNum, []);
            groupedMap.get(pNum).push({
              target: s.target.trim(),
              ru: String(s.ru || '').trim()
            });
          }

          const cleanParagraphs = Array.from(groupedMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, list]) => list)
            .filter(list => list.length > 0);

          if (cleanParagraphs.length > 0) {
            return res.status(200).json({
              titleTarget: String(parsed.titleTarget || finalTopic).trim(),
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

      const buildStartPayload = (thinkingConfig) => ({
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
      });

      let startRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildStartPayload({ thinkingBudget: 0 }), 7000);
      if (!startRes.ok && startRes.status === 400) {
        startRes = await callGemini(apiKey, 'gemini-3.5-flash-lite', buildStartPayload(null), 5000);
      }

      if (startRes.ok) {
        try {
          const parts = startRes.data?.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => !p.thought && typeof p.text === 'string') || parts[parts.length - 1];
          const parsed = extractJson(textPart?.text || '');
          if (parsed.replyTarget) {
            return res.status(200).json({
              userTranscript: '',
              hasErrors: false,
              correction: '',
              explanationRu: '',
              replyTarget: parsed.replyTarget,
              replyRu: parsed.replyRu || ''
            });
          }
        } catch (_) {}
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

    const buildPayload = (thinkingConfig) => ({
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
      replyTarget: parsed.replyTarget || '...',
      replyRu: parsed.replyRu || ''
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Ошибка сервера: ' + (err?.message || 'попробуйте ещё раз.') });
  }
}
