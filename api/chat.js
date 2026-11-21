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
    { target
