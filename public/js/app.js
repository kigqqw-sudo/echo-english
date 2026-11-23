import { LANGUAGES, LEVELS, CHAT_TOPICS, GRAMMAR_TOPICS_BY_LANG } from './data.js';

// --- DOM-элементы ---
const langSelect = document.getElementById('langSelect');
const levelSelect = document.getElementById('levelSelect');
const topicSelect = document.getElementById('topicSelect');
const themeBtn = document.getElementById('themeBtn');
const autoPlayBtn = document.getElementById('autoPlayBtn');
const restartBtn = document.getElementById('restartBtn');

const chatView = document.getElementById('chatView');
const chatEl = document.getElementById('chat');
const readingView = document.getElementById('readingView');
const grammarView = document.getElementById('grammarView');
const vocabView = document.getElementById('vocabView');

const readingForm = document.getElementById('readingForm');
const customTopicInput = document.getElementById('customTopicInput');
const genReadingBtn = document.getElementById('genReadingBtn');
const readingContent = document.getElementById('readingContent');

const grammarTopicsLabel = document.getElementById('grammarTopicsLabel');
const grammarTopicsChips = document.getElementById('grammarTopicsChips');
const grammarCustomForm = document.getElementById('grammarCustomForm');
const grammarCustomInput = document.getElementById('grammarCustomInput');
const grammarStartBtn = document.getElementById('grammarStartBtn');
const grammarContent = document.getElementById('grammarContent');

const voicePanel = document.getElementById('voicePanel');
const textPanel = document.getElementById('textPanel');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const cancelRecBtn = document.getElementById('cancelRecBtn');
const recInfo = document.getElementById('recInfo');
const recTimer = document.getElementById('recTimer');
const meterFill = document.getElementById('meterFill');
const hintText = document.getElementById('hintText');
const toTextBtn = document.getElementById('toTextBtn');
const toVoiceBtn = document.getElementById('toVoiceBtn');
const textInput = document.getElementById('textInput');
const sendTextBtn = document.getElementById('sendTextBtn');

const navButtons = {
  chat: document.getElementById('navChat'),
  reading: document.getElementById('navReading'),
  grammar: document.getElementById('navGrammar'),
  vocab: document.getElementById('navVocab')
};
const navVocabBadge = document.getElementById('navVocabBadge');

const saveModal = document.getElementById('saveModal');
const closeSaveModal = document.getElementById('closeSaveModal');
const cancelSaveBtn = document.getElementById('cancelSaveBtn');
const deleteFromQuickBtn = document.getElementById('deleteFromQuickBtn');
const confirmSaveBtn = document.getElementById('confirmSaveBtn');
const saveWordForm = document.getElementById('saveWordForm');
const swWord = document.getElementById('swWord');
const swWordLabel = document.getElementById('swWordLabel');
const swTranslation = document.getElementById('swTranslation');
const swNote = document.getElementById('swNote');
const swPlayBtn = document.getElementById('swPlayBtn');

const tabNotes = document.getElementById('tabNotes');
const tabCards = document.getElementById('tabCards');
const notesView = document.getElementById('notesView');
const cardsView = document.getElementById('cardsView');
const manualAddForm = document.getElementById('manualAddForm');
const manualTarget = document.getElementById('manualEn');
const manualRu = document.getElementById('manualRu');
const manualNote = document.getElementById('manualNote');
const vocabListEl = document.getElementById('vocabList');
const toastEl = document.getElementById('toast');

// --- Состояние ---
const MAX_SECONDS = 45;
const THEME_STORAGE_KEY = 'echo_theme_v1';
const LANG_STORAGE_KEY = 'echo_lang_v1';
const SEEN_STORAGE_KEY = 'echo_seen_ids_v1';
const GRAMMAR_DONE_KEY = 'echo_grammar_done_v1';
const STATS_STORAGE_KEY = 'echo_stats_v1';
const MAX_SEEN_PER_BUCKET = 50;

let currentLangCode = loadSavedLang();
let currentMode = 'chat';
let vocabTab = 'notes';

let readingLoadedOnce = false;
let isReadingBusy = false;
let readingSpeed = 1.0;

let isGrammarBusy = false;
let activeGrammarTopic = '';
let grammarLesson = null;
let grammarIndex = 0;
let grammarScore = 0;
let grammarAnswered = false;
let grammarRuleCollapsed = false;

let history = [];
let autoPlay = true;
let isBusy = false;
let isRecording = false;
let cancelRequested = false;

let mediaRecorder = null;
let audioChunks = [];
let activeStream = null;
let audioContext = null;
let animFrame = null;
let timerInterval = null;
let recStartTime = 0;

let availableVoices = [];
let activeVoiceBar = null;
let activeReadingPlayBtn = null;

let vocab = [];
let fcQueue = [];
let fcTotal = 0;
let fcKnown = 0;
let fcFlipped = false;
let fcDirection = 'target-ru';

// --- Память просмотренных материалов (seenIds) ---
function loadSeenMap() {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getSeenIds(bucket) {
  const map = loadSeenMap();
  return Array.isArray(map[bucket]) ? map[bucket] : [];
}

function rememberSeenId(bucket, id) {
  if (id === undefined || id === null || id === '') return;
  const cleanId = String(id);
  const map = loadSeenMap();
  const list = Array.isArray(map[bucket]) ? map[bucket].filter(x => String(x) !== cleanId) : [];
  list.push(cleanId);
  map[bucket] = list.slice(-MAX_SEEN_PER_BUCKET);
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(map));
  } catch (_) {}
}

// --- Прогресс по грамматике и базовая геймификация (XP + стрик) ---
function loadGrammarDoneMap() {
  try {
    const raw = localStorage.getItem(GRAMMAR_DONE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getGrammarDoneKey(langCode, level, topic) {
  return `${langCode}::${level}::${String(topic || '').trim().toLowerCase()}`;
}

function isGrammarTopicDone(langCode, level, topic) {
  const map = loadGrammarDoneMap();
  return Boolean(map[getGrammarDoneKey(langCode, level, topic)]);
}

function markGrammarTopicDone(langCode, level, topic) {
  const map = loadGrammarDoneMap();
  map[getGrammarDoneKey(langCode, level, topic)] = Date.now();
  try {
    localStorage.setItem(GRAMMAR_DONE_KEY, JSON.stringify(map));
  } catch (_) {}
}

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function awardXp(amount, notify = false) {
  if (!amount || amount <= 0) return null;
  let stats = { xp: 0, streak: 0, lastDate: '' };
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (raw) stats = { ...stats, ...JSON.parse(raw) };
  } catch (_) {}

  const today = getTodayKey();
  if (stats.lastDate !== today) {
    stats.streak = stats.lastDate === getYesterdayKey() ? (stats.streak || 0) + 1 : 1;
    stats.lastDate = today;
  }
  stats.xp = (stats.xp || 0) + amount;

  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (_) {}

  if (notify) {
    showToast(`+${amount} XP · Серия: ${stats.streak} дн. · Всего: ${stats.xp} XP`);
  }
  return stats;
}

// --- Языковые хелперы ---
function loadSavedLang() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && LANGUAGES.some(l => l.code === saved)) return saved;
  } catch (_) {}
  return 'en';
}

function getCurrentLang() {
  return LANGUAGES.find(l => l.code === currentLangCode) || LANGUAGES[0];
}

function getVocabStorageKey(code = currentLangCode) {
  // Для английского оставляем старый ключ, чтобы сохранились все прежние заметки
  return code === 'en' ? 'echo_vocab_v1' : `echo_vocab_v1_${code}`;
}

function updateLanguageLabels() {
  const lang = getCurrentLang();
  textInput.placeholder = `Напишите фразу ${lang.nameRuPrep}...`;
  grammarCustomInput.placeholder = lang.grammarPlaceholder;
  manualTarget.placeholder = `Слово ${lang.nameRuPrep} (${lang.short})`;
  if (swWordLabel) {
    swWordLabel.textContent = `Слово или фраза (${lang.short})`;
  }
}

// --- Тема (светлая / тёмная) ---
function moonSvg() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
}

function sunSvg() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  themeBtn.innerHTML = isDark ? sunSvg() : moonSvg();
  themeBtn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch (_) {}
}

themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
});

// --- Инициализация списков в шапке ---
function initSelects() {
  langSelect.innerHTML = LANGUAGES
    .map(l => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.short)} · ${escapeHtml(l.nameRu)}</option>`)
    .join('');
  langSelect.value = currentLangCode;

  levelSelect.innerHTML = LEVELS
    .map(l => `<option value="${escapeHtml(l.value)}">${escapeHtml(l.label)}</option>`)
    .join('');
  levelSelect.value = 'B1';

  topicSelect.innerHTML = CHAT_TOPICS
    .map(t => `<option value="${escapeHtml(t.value)}">${escapeHtml(t.label)}</option>`)
    .join('');
}

// --- Словарь (отдельный для каждого языка) ---
function loadVocab() {
  try {
    const raw = localStorage.getItem(getVocabStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Поддержка старых записей, где поле называлось en
    return parsed.map(item => ({
      id: item.id || (Date.now() + Math.random().toString(16).slice(2, 6)),
      target: String(item.target || item.en || '').trim(),
      ru: String(item.ru || '').trim(),
      note: String(item.note || '').trim()
    })).filter(item => item.target);
  } catch (_) {
    return [];
  }
}

function isWordSaved(word) {
  const target = String(word || '').trim().toLowerCase();
  if (!target) return false;
  return vocab.some(v => v.target.toLowerCase() === target);
}

function refreshSavedWordHighlights() {
  document.querySelectorAll('.clickable-word').forEach(el => {
    el.classList.toggle('saved', isWordSaved(el.dataset.word));
  });
}

function persistVocab() {
  try {
    localStorage.setItem(getVocabStorageKey(), JSON.stringify(vocab));
  } catch (_) {}
  updateVocabBadge();
  refreshSavedWordHighlights();
}

function updateVocabBadge() {
  navVocabBadge.textContent = String(vocab.length);
  navVocabBadge.classList.toggle('empty', vocab.length === 0);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function addVocabEntry(targetWord, ru, note = '') {
  const cleanTarget = String(targetWord || '').trim();
  const cleanRu = String(ru || '').trim();
  const cleanNote = String(note || '').trim();
  if (!cleanTarget || !cleanRu) return;

  const existingIdx = vocab.findIndex(v => v.target.toLowerCase() === cleanTarget.toLowerCase());
  if (existingIdx !== -1) {
    vocab[existingIdx] = { ...vocab[existingIdx], target: cleanTarget, ru: cleanRu, note: cleanNote };
    showToast('Заметка обновлена');
  } else {
    vocab.unshift({
      id: Date.now() + Math.random().toString(16).slice(2, 6),
      target: cleanTarget,
      ru: cleanRu,
      note: cleanNote
    });
    showToast('Сохранено в словарь');
  }
  persistVocab();
  if (currentMode === 'vocab' && vocabTab === 'notes') {
    renderVocabList();
  }
}

function deleteVocabEntry(id) {
  vocab = vocab.filter(item => item.id !== id);
  persistVocab();
  renderVocabList();
}

// --- Смена языка ---
function handleLanguageChange(newCode) {
  stopSpeech();
  if (isRecording) stopRecording(true);

  currentLangCode = newCode;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, newCode);
  } catch (_) {}

  vocab = loadVocab();
  updateVocabBadge();
  updateLanguageLabels();

  readingLoadedOnce = false;
  readingContent.innerHTML = '';
  activeGrammarTopic = '';
  grammarLesson = null;
  customTopicInput.value = '';
  grammarCustomInput.value = '';

  const lang = getCurrentLang();
  showToast(`Язык: ${lang.nameRu}`);

  if (currentMode === 'chat') {
    startConversation();
  } else if (currentMode === 'reading') {
    generateReadingText();
  } else if (currentMode === 'grammar') {
    renderGrammarTopicChips();
  } else if (currentMode === 'vocab') {
    switchVocabTab(vocabTab);
  }
}

langSelect.addEventListener('change', () => {
  handleLanguageChange(langSelect.value);
});

// --- Навигация между вкладками ---
function switchMode(mode) {
  if (currentMode === mode) return;
  stopSpeech();
  if (isRecording) stopRecording(true);

  currentMode = mode;

  Object.entries(navButtons).forEach(([key, btn]) => {
    btn.classList.toggle('active', key === mode);
  });

  chatView.classList.toggle('active', mode === 'chat');
  readingView.classList.toggle('active', mode === 'reading');
  grammarView.classList.toggle('active', mode === 'grammar');
  vocabView.classList.toggle('active', mode === 'vocab');

  levelSelect.classList.toggle('is-hidden', mode === 'vocab');
  topicSelect.classList.toggle('is-hidden', mode === 'grammar' || mode === 'vocab');
  autoPlayBtn.classList.toggle('is-hidden', mode !== 'chat');
  restartBtn.classList.toggle('is-hidden', mode === 'vocab');

  if (mode === 'reading' && !readingLoadedOnce) {
    generateReadingText();
  }
  if (mode === 'grammar') {
    renderGrammarTopicChips();
  }
  if (mode === 'vocab') {
    switchVocabTab(vocabTab);
  }
}

navButtons.chat.addEventListener('click', () => switchMode('chat'));
navButtons.reading.addEventListener('click', () => switchMode('reading'));
navButtons.grammar.addEventListener('click', () => switchMode('grammar'));
navButtons.vocab.addEventListener('click', () => switchMode('vocab'));

// --- Вкладка «Грамматика» ---
function renderGrammarTopicChips() {
  const lang = getCurrentLang();
  const lvl = levelSelect.value;
  const langTopics = GRAMMAR_TOPICS_BY_LANG[lang.code] || GRAMMAR_TOPICS_BY_LANG.en;
  const topics = langTopics[lvl] || langTopics.B1;
  const doneCount = topics.filter(t => isGrammarTopicDone(lang.code, lvl, t)).length;

  grammarTopicsLabel.textContent = `${lang.nameRu} · грамматика уровня ${lvl} · пройдено ${doneCount} из ${topics.length}`;
  grammarTopicsChips.innerHTML = '';

  topics.forEach(t => {
    const done = isGrammarTopicDone(lang.code, lvl, t);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'g-topic-chip' + (activeGrammarTopic === t ? ' selected' : '');
    btn.textContent = done ? `✓ ${t}` : t;
    btn.addEventListener('click', () => {
      grammarCustomInput.value = '';
      loadGrammarLesson(t);
    });
    grammarTopicsChips.appendChild(btn);
  });

  if (!grammarLesson && !isGrammarBusy) {
    grammarContent.innerHTML = `
      <div class="card" style="text-align:center; padding:28px 20px;">
        <div style="font-size:15px; font-weight:600;">Выберите тему выше или впишите свою</div>
        <div style="font-size:13px; color:var(--text-secondary); line-height:1.5;">
          Echo подробно разберёт правило (${escapeHtml(lang.nameRu.toLowerCase())}, уровень <strong>${escapeHtml(lvl)}</strong>) с формулами, примерами и частыми ошибками, а затем даст 4 задания с проверкой.
        </div>
      </div>
    `;
  }
}

async function loadGrammarLesson(topicName) {
  if (isGrammarBusy) return;
  const cleanTopic = String(topicName || '').trim();
  if (!cleanTopic) return;

  stopSpeech();
  activeGrammarTopic = cleanTopic;
  renderGrammarTopicChips();

  isGrammarBusy = true;
  grammarStartBtn.disabled = true;
  grammarStartBtn.textContent = 'Готовим...';

  grammarContent.innerHTML = `<div class="status-note" style="margin: 24px auto; width: fit-content;">Echo готовит разбор и задания по теме «${escapeHtml(cleanTopic)}»...</div>`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'grammar_lesson',
        language: currentLangCode,
        level: levelSelect.value,
        grammarTopic: cleanTopic
      })
    });

    const data = await res.json();
    isGrammarBusy = false;
    grammarStartBtn.disabled = false;
    grammarStartBtn.textContent = 'Начать';

    if (!res.ok) {
      grammarContent.innerHTML = `<div class="error-banner">${escapeHtml(data.error || 'Не удалось создать урок.')}</div>`;
      return;
    }

    grammarLesson = data;
    grammarIndex = 0;
    grammarScore = 0;
    grammarAnswered = false;
    grammarRuleCollapsed = false;
    renderGrammarWorkspace();
  } catch (_) {
    isGrammarBusy = false;
    grammarStartBtn.disabled = false;
    grammarStartBtn.textContent = 'Начать';
    grammarContent.innerHTML = `<div class="error-banner">Ошибка соединения с сервером. Попробуйте ещё раз.</div>`;
  }
}

function normalizeGrammarAnswer(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.,!?;:。！？、]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderGrammarWorkspace() {
  if (!grammarLesson) return;
  grammarContent.innerHTML = '';

  const ruleCard = document.createElement('div');
  ruleCard.className = 'card';

  const usageHtml = (grammarLesson.whenToUseRu && grammarLesson.whenToUseRu.length > 0)
    ? `
      <div>
        <div class="g-subhead">Когда используется</div>
        <ul class="g-usage-list">
          ${grammarLesson.whenToUseRu.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const sectionsHtml = (grammarLesson.sections || []).map(sec => {
    const exHtml = (sec.examples || []).map(ex => {
      const targetTxt = ex.target || ex.en || '';
      return `
        <div class="g-example-row">
          <div>
            <div class="g-example-en">${renderClickableText(targetTxt)}</div>
            <div class="g-example-ru">${escapeHtml(ex.ru)}</div>
          </div>
          <button type="button" class="icon-btn g-play-ex" data-text="${escapeHtml(targetTxt)}" title="Прослушать">▶</button>
        </div>
      `;
    }).join('');

    return `
      <div class="g-rule-block">
        ${sec.headingRu ? `<div class="g-block-heading">${escapeHtml(sec.headingRu)}</div>` : ''}
        ${sec.formula ? `<div><span class="g-formula">${escapeHtml(sec.formula)}</span></div>` : ''}
        ${sec.explanationRu ? `<div class="g-summary">${escapeHtml(sec.explanationRu)}</div>` : ''}
        ${exHtml ? `<div class="g-examples">${exHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  const markersHtml = (grammarLesson.markers && grammarLesson.markers.length > 0)
    ? `
      <div>
        <div class="g-subhead">Слова-маркеры и ориентиры</div>
        <div class="g-markers">
          ${grammarLesson.markers.map(m => `<span class="g-marker-pill">${escapeHtml(m)}</span>`).join('')}
        </div>
      </div>
    `
    : '';

  const mistakesHtml = (grammarLesson.commonMistakes && grammarLesson.commonMistakes.length > 0)
    ? `
      <div>
        <div class="g-subhead">Частые ошибки</div>
        <div class="g-mistakes">
          ${grammarLesson.commonMistakes.map(m => {
            const wrongTxt = m.wrongTarget || m.wrongEn || '';
            const rightTxt = m.rightTarget || m.rightEn || '';
            return `
              <div class="g-mistake-row">
                <div class="g-mistake-wrong">✕ ${escapeHtml(wrongTxt)}</div>
                <div class="g-mistake-right-wrap">
                  <span class="g-mistake-right">✓ ${renderClickableText(rightTxt)}</span>
                  <button type="button" class="icon-btn g-play-ex" style="width:28px; height:28px; font-size:11px;" data-text="${escapeHtml(rightTxt)}" title="Прослушать">▶</button>
                </div>
                ${m.explanationRu ? `<div class="g-mistake-exp">${escapeHtml(m.explanationRu)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `
    : '';

  ruleCard.innerHTML = `
    <div class="g-rule-head">
      <div class="g-rule-title">${escapeHtml(grammarLesson.topicTitle)}</div>
      <button type="button" id="toggleRuleBtn" class="chip-btn">${grammarRuleCollapsed ? 'Показать теорию' : 'Свернуть теорию'}</button>
    </div>
    <div id="ruleBody" style="display:${grammarRuleCollapsed ? 'none' : 'flex'}; flex-direction:column; gap:16px;">
      ${usageHtml}
      ${sectionsHtml ? `<div><div class="g-subhead">Правила и примеры</div><div class="g-blocks">${sectionsHtml}</div></div>` : ''}
      ${markersHtml}
      ${mistakesHtml}
      <div class="reading-legend" style="padding-top:8px;">Нажмите на любое слово в примерах, чтобы перевести и сохранить его в словарь.</div>
    </div>
  `;

  ruleCard.querySelector('#toggleRuleBtn').addEventListener('click', () => {
    grammarRuleCollapsed = !grammarRuleCollapsed;
    ruleCard.querySelector('#ruleBody').style.display = grammarRuleCollapsed ? 'none' : 'flex';
    ruleCard.querySelector('#toggleRuleBtn').textContent = grammarRuleCollapsed ? 'Показать теорию' : 'Свернуть теорию';
  });

  ruleCard.querySelectorAll('.g-play-ex').forEach(btn => {
    btn.addEventListener('click', () => speakText(btn.dataset.text, 0.95));
  });

  ruleCard.addEventListener('click', (e) => {
    const w = e.target.closest('.clickable-word');
    if (!w) return;
    const container = w.closest('.g-example-en, .g-mistake-right');
    const ctx = container ? container.textContent.replace(/^✓\s*/, '') : '';
    openQuickSave(w.dataset.word, ctx);
  });

  grammarContent.appendChild(ruleCard);

  const exCard = document.createElement('div');
  exCard.className = 'card';
  exCard.id = 'grammarExerciseCard';
  renderGrammarExerciseInto(exCard);
  grammarContent.appendChild(exCard);

  const askCard = document.createElement('div');
  askCard.className = 'card';
  askCard.innerHTML = `
    <div style="font-size:14px; font-weight:700;">Остались вопросы по этой теме?</div>
    <form id="grammarAskForm" class="action-bar">
      <input id="grammarAskInput" class="field-input" type="text" placeholder="Задайте любой вопрос по правилу..." required />
      <button id="grammarAskBtn" type="submit" class="primary-btn">Спросить</button>
    </form>
    <div id="grammarAskResult"></div>
  `;

  const askForm = askCard.querySelector('#grammarAskForm');
  const askInput = askCard.querySelector('#grammarAskInput');
  const askBtn = askCard.querySelector('#grammarAskBtn');
  const askResult = askCard.querySelector('#grammarAskResult');

  askForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = askInput.value.trim();
    if (!q) return;
    askBtn.disabled = true;
    askBtn.textContent = 'Думает...';
    askResult.innerHTML = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grammar_ask',
          language: currentLangCode,
          level: levelSelect.value,
          grammarTopic: grammarLesson.topicTitle || activeGrammarTopic,
          question: q
        })
      });
      const data = await res.json();
      askBtn.disabled = false;
      askBtn.textContent = 'Спросить';

      if (!res.ok) {
        askResult.innerHTML = `<div class="error-banner">${escapeHtml(data.error || 'Ошибка запроса.')}</div>`;
        return;
      }

      const exText = data.exampleTarget || data.exampleEn || '';
      askResult.innerHTML = `
        <div class="g-ask-answer">
          <div>${escapeHtml(data.answerRu)}</div>
          ${exText ? `
            <div class="g-example-row">
              <div>
                <div class="g-example-en">${renderClickableText(exText)}</div>
                <div class="g-example-ru">${escapeHtml(data.exampleRu)}</div>
              </div>
              <button type="button" class="icon-btn g-play-ask" title="Прослушать">▶</button>
            </div>
          ` : ''}
        </div>
      `;
      const playAsk = askResult.querySelector('.g-play-ask');
      if (playAsk) playAsk.addEventListener('click', () => speakText(exText, 0.95));
      askResult.addEventListener('click', (ev) => {
        const w = ev.target.closest('.clickable-word');
        if (w) openQuickSave(w.dataset.word, exText);
      });
      askInput.value = '';
    } catch (_) {
      askBtn.disabled = false;
      askBtn.textContent = 'Спросить';
      askResult.innerHTML = `<div class="error-banner">Ошибка сети. Попробуйте ещё раз.</div>`;
    }
  });

  grammarContent.appendChild(askCard);
}

function renderGrammarExerciseInto(container) {
  const list = grammarLesson.exercises || [];
  const total = list.length;

  if (grammarIndex >= total) {
    const pct = total > 0 ? Math.round((grammarScore / total) * 100) : 0;
    if (pct >= 50 && activeGrammarTopic) {
      markGrammarTopicDone(currentLangCode, levelSelect.value, activeGrammarTopic);
      renderGrammarTopicChips();
      awardXp(20, true);
    }

    const msg = pct === 100
      ? 'Безупречно! Тема отлично усвоена.'
      : pct >= 50
        ? 'Хороший результат! Тема отмечена как пройденная.'
        : 'Неплохое начало — попробуйте пройти задания ещё раз, подглядывая в правило.';

    container.innerHTML = `
      <div style="text-align:center; padding:12px 6px; display:flex; flex-direction:column; gap:10px; align-items:center;">
        <div style="font-size:28px; font-weight:800;">${grammarScore} / ${total}</div>
        <div style="font-size:14px; color:var(--text-secondary); max-width:380px; line-height:1.5;">${msg}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:6px;">
          <button type="button" id="gMoreBtn" class="primary-btn">Пройти задания ещё раз</button>
        </div>
      </div>
    `;
    container.querySelector('#gMoreBtn').addEventListener('click', () => {
      grammarIndex = 0;
      grammarScore = 0;
      grammarAnswered = false;
      renderGrammarExerciseInto(container);
    });
    return;
  }

  const ex = list[grammarIndex];
  const progressPct = Math.round((grammarIndex / total) * 100);
  const sentenceHtml = escapeHtml(ex.sentence).replace('___', '<span id="gBlankSpan" class="g-blank">___</span>');

  container.innerHTML = `
    <div class="g-progress-row">
      <span>Задание ${grammarIndex + 1} из ${total}</span>
      <span>Верно: ${grammarScore}</span>
    </div>
    <div class="g-progress-bar"><div class="g-progress-fill" style="width:${progressPct}%"></div></div>
    <div class="g-prompt">${escapeHtml(ex.promptRu)}${ex.hint ? ` · подсказка: <strong>${escapeHtml(ex.hint)}</strong>` : ''}</div>
    <div class="g-sentence">${sentenceHtml}</div>
    <div id="gInteractionArea"></div>
    <div id="gFeedbackArea"></div>
  `;

  const interactionArea = container.querySelector('#gInteractionArea');
  const feedbackArea = container.querySelector('#gFeedbackArea');
  const blankSpan = container.querySelector('#gBlankSpan');

  function handleResult(isCorrect, userValue) {
    if (grammarAnswered) return;
    grammarAnswered = true;
    if (isCorrect) grammarScore += 1;

    if (blankSpan) {
      blankSpan.textContent = ex.answer;
      blankSpan.classList.add(isCorrect ? 'ok' : 'bad');
    }

    feedbackArea.innerHTML = `
      <div class="g-feedback-box ${isCorrect ? 'ok' : 'bad'}">
        <div><strong>${isCorrect ? '✓ Верно!' : `✕ Правильный ответ: ${escapeHtml(ex.answer)}`}</strong>${!isCorrect && userValue ? ` (ваш ответ: ${escapeHtml(userValue)})` : ''}</div>
        <div>${escapeHtml(ex.explanationRu)}</div>
        <div class="g-feedback-sent">
          <span>${renderClickableText(ex.fullSentence)}</span>
          <button type="button" id="gPlayCorrect" class="chip-btn" style="flex-shrink:0;">▶</button>
        </div>
        ${ex.translationRu ? `<div class="g-feedback-tr">${escapeHtml(ex.translationRu)}</div>` : ''}
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:10px;">
        <button type="button" id="gNextBtn" class="primary-btn">${grammarIndex + 1 < total ? 'Следующее задание →' : 'Показать результат'}</button>
      </div>
    `;

    feedbackArea.querySelector('#gPlayCorrect').addEventListener('click', () => {
      speakText(ex.fullSentence, 0.95);
    });

    feedbackArea.addEventListener('click', (ev) => {
      const w = ev.target.closest('.clickable-word');
      if (w) openQuickSave(w.dataset.word, ex.fullSentence);
    });

    feedbackArea.querySelector('#gNextBtn').addEventListener('click', () => {
      grammarIndex += 1;
      grammarAnswered = false;
      renderGrammarExerciseInto(container);
    });
  }

  if (ex.type === 'choice') {
    const grid = document.createElement('div');
    grid.className = 'g-options';
    const shuffled = [...ex.options].sort(() => Math.random() - 0.5);

    shuffled.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'g-opt-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        if (grammarAnswered) return;
        const isCorrect = normalizeGrammarAnswer(opt) === normalizeGrammarAnswer(ex.answer);
        grid.querySelectorAll('.g-opt-btn').forEach(b => {
          b.disabled = true;
          if (normalizeGrammarAnswer(b.textContent) === normalizeGrammarAnswer(ex.answer)) {
            b.classList.add('correct');
          } else if (b === btn && !isCorrect) {
            b.classList.add('wrong');
          }
        });
        handleResult(isCorrect, opt);
      });
      grid.appendChild(btn);
    });

    interactionArea.appendChild(grid);
  } else {
    const form = document.createElement('form');
    form.className = 'g-input-row';
    form.innerHTML = `
      <input id="gAnswerInput" class="field-input" type="text" placeholder="Впишите пропущенное слово..." autocomplete="off" required />
      <button type="submit" class="primary-btn">Проверить</button>
    `;
    const inp = form.querySelector('#gAnswerInput');
    const subBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (grammarAnswered) return;
      const val = inp.value.trim();
      if (!val) return;
      inp.disabled = true;
      subBtn.disabled = true;
      const isCorrect = normalizeGrammarAnswer(val) === normalizeGrammarAnswer(ex.answer);
      handleResult(isCorrect, val);
    });

    interactionArea.appendChild(form);
    setTimeout(() => inp.focus(), 50);
  }
}

grammarCustomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = grammarCustomInput.value.trim();
  if (val) loadGrammarLesson(val);
});

// --- Вкладка «Чтение» ---
async function generateReadingText() {
  if (isReadingBusy) return;
  stopSpeech();
  isReadingBusy = true;
  readingLoadedOnce = true;
  genReadingBtn.disabled = true;
  genReadingBtn.textContent = 'Создаём...';

  const lang = getCurrentLang();
  const customTopic = customTopicInput.value.trim();
  const seenBucket = `reading::${currentLangCode}::${levelSelect.value}::${customTopic || topicSelect.value}`;

  readingContent.innerHTML = `<div class="status-note" style="margin: 24px auto; width: fit-content;">Echo пишет текст ${escapeHtml(lang.nameRuPrep)} (${escapeHtml(levelSelect.value)})...</div>`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reading',
        language: currentLangCode,
        level: levelSelect.value,
        topic: topicSelect.value,
        customTopic,
        seenIds: getSeenIds(seenBucket)
      })
    });

    const data = await res.json();
    isReadingBusy = false;
    genReadingBtn.disabled = false;
    genReadingBtn.textContent = 'Новый текст';

    if (!res.ok) {
      readingContent.innerHTML = `<div class="error-banner">${escapeHtml(data.error || 'Не удалось создать текст.')}</div>`;
      return;
    }

    const itemId = data.id || data.readingId || data.cacheId;
    if (itemId) rememberSeenId(seenBucket, itemId);
    awardXp(10, false);

    renderReadingArticle(data);
  } catch (_) {
    isReadingBusy = false;
    genReadingBtn.disabled = false;
    genReadingBtn.textContent = 'Новый текст';
    readingContent.innerHTML = `<div class="error-banner">Ошибка соединения с сервером. Попробуйте ещё раз.</div>`;
  }
}

function renderReadingArticle(data) {
  const titleTarget = data.titleTarget || data.titleEn || '';
  const allSentences = [];
  const card = document.createElement('article');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'reading-header';
  header.innerHTML = `
    <div>
      <div class="reading-title-en">${renderClickableText(titleTarget)}</div>
      ${data.titleRu ? `<div class="reading-title-ru">${escapeHtml(data.titleRu)}</div>` : ''}
    </div>
    <div class="reading-tools">
      <button type="button" id="readAllPlayBtn" class="chip-btn">▶ Слушать текст</button>
      <button type="button" id="readSpeedBtn" class="speed-btn">${readingSpeed.toFixed(1)}x</button>
      <button type="button" id="readToggleAllBtn" class="chip-btn">Перевод всего текста</button>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'reading-body';

  (data.paragraphs || []).forEach(paragraph => {
    const pEl = document.createElement('div');
    pEl.className = 'reading-paragraph';

    paragraph.forEach(sent => {
      const sentText = sent.target || sent.en || '';
      allSentences.push(sentText);

      const unit = document.createElement('span');
      unit.className = 'sentence-unit';
      unit.dataset.sentenceTarget = sentText;

      const enSpan = document.createElement('span');
      enSpan.className = 'sentence-en';
      enSpan.innerHTML = renderClickableText(sentText);

      const tools = document.createElement('span');
      tools.className = 'sentence-tools';

      const trBtn = document.createElement('button');
      trBtn.type = 'button';
      trBtn.className = 'sent-btn tr-sent-btn';
      trBtn.textContent = 'RU';
      trBtn.title = 'Перевести это предложение';

      const playSentBtn = document.createElement('button');
      playSentBtn.type = 'button';
      playSentBtn.className = 'sent-btn';
      playSentBtn.textContent = '▶';
      playSentBtn.title = 'Прослушать предложение';

      tools.appendChild(trBtn);
      tools.appendChild(playSentBtn);

      const ruBox = document.createElement('span');
      ruBox.className = 'sentence-ru';
      ruBox.innerHTML = `
        <span>${escapeHtml(sent.ru || 'Перевод недоступен')}</span>
        <button type="button" class="save-sent-btn">+ В заметки</button>
      `;

      trBtn.addEventListener('click', () => {
        const isOpen = ruBox.classList.toggle('show');
        trBtn.classList.toggle('open', isOpen);
      });

      playSentBtn.addEventListener('click', () => {
        speakText(sentText, readingSpeed);
      });

      ruBox.querySelector('.save-sent-btn').addEventListener('click', () => {
        openQuickSave(sentText, '', '', sent.ru || '');
      });

      unit.appendChild(enSpan);
      unit.appendChild(tools);
      unit.appendChild(ruBox);
      pEl.appendChild(unit);
    });

    body.appendChild(pEl);
  });

  const legend = document.createElement('div');
  legend.className = 'reading-legend';
  legend.textContent = 'Нажмите на любое слово, чтобы перевести и отметить его в словаре. Нажмите «RU» после предложения для его перевода.';

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(legend);

  card.addEventListener('click', (e) => {
    const wordEl = e.target.closest('.clickable-word');
    if (!wordEl) return;
    const unit = wordEl.closest('.sentence-unit');
    const ctx = unit ? unit.dataset.sentenceTarget : titleTarget;
    openQuickSave(wordEl.dataset.word, ctx);
  });

  const fullText = [titleTarget, ...allSentences].join('. ');
  const readAllPlayBtn = header.querySelector('#readAllPlayBtn');
  const readSpeedBtn = header.querySelector('#readSpeedBtn');
  const readToggleAllBtn = header.querySelector('#readToggleAllBtn');
  const titleRuEl = header.querySelector('.reading-title-ru');

  readAllPlayBtn.addEventListener('click', () => {
    if (activeReadingPlayBtn === readAllPlayBtn) {
      stopSpeech();
      return;
    }
    speakText(fullText, readingSpeed, null, readAllPlayBtn);
  });

  readSpeedBtn.addEventListener('click', () => {
    readingSpeed = readingSpeed === 1.0 ? 0.8 : 1.0;
    readSpeedBtn.textContent = readingSpeed.toFixed(1) + 'x';
    if (activeReadingPlayBtn === readAllPlayBtn) {
      stopSpeech();
      speakText(fullText, readingSpeed, null, readAllPlayBtn);
    }
  });

  let allOpen = false;
  readToggleAllBtn.addEventListener('click', () => {
    allOpen = !allOpen;
    readToggleAllBtn.classList.toggle('open', allOpen);
    readToggleAllBtn.textContent = allOpen ? 'Скрыть перевод' : 'Перевод всего текста';
    if (titleRuEl) titleRuEl.classList.toggle('show', allOpen);
    card.querySelectorAll('.sentence-ru').forEach(el => el.classList.toggle('show', allOpen));
    card.querySelectorAll('.tr-sent-btn').forEach(el => el.classList.toggle('open', allOpen));
  });

  readingContent.innerHTML = '';
  readingContent.appendChild(card);
}

readingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  generateReadingText();
});

// --- Быстрое окно сохранения слова/фразы ---
async function openQuickSave(word, contextSentence = '', presetNote = '', presetTranslation = '') {
  const cleanWord = String(word || '').trim();
  swWord.value = cleanWord;
  swTranslation.value = presetTranslation;
  swNote.value = presetNote;
  saveModal.classList.add('open');

  const existing = vocab.find(v => v.target.toLowerCase() === cleanWord.toLowerCase());
  if (existing) {
    swTranslation.value = existing.ru;
    if (!presetNote) swNote.value = existing.note || '';
    swTranslation.placeholder = 'Перевод на русский';
    confirmSaveBtn.textContent = 'Обновить';
    deleteFromQuickBtn.style.display = 'inline-block';
    deleteFromQuickBtn.dataset.id = existing.id;
    return;
  }

  confirmSaveBtn.textContent = 'Сохранить';
  deleteFromQuickBtn.style.display = 'none';
  deleteFromQuickBtn.dataset.id = '';

  if (presetTranslation) {
    swTranslation.placeholder = 'Перевод на русский';
    return;
  }

  swTranslation.placeholder = 'Переводим...';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'translate',
        language: currentLangCode,
        word: cleanWord,
        context: contextSentence
      })
    });
    const data = await res.json();
    if (res.ok && swWord.value === cleanWord) {
      swTranslation.value = data.translation || '';
      if (!swNote.value && data.note) {
        swNote.value = data.note;
      }
    }
  } catch (_) {}

  swTranslation.placeholder = 'Введите перевод вручную';
  if (!swTranslation.value) swTranslation.focus();
}

function closeQuickSave() {
  saveModal.classList.remove('open');
}

closeSaveModal.addEventListener('click', closeQuickSave);
cancelSaveBtn.addEventListener('click', closeQuickSave);
saveModal.addEventListener('click', (e) => {
  if (e.target === saveModal) closeQuickSave();
});

deleteFromQuickBtn.addEventListener('click', () => {
  const id = deleteFromQuickBtn.dataset.id;
  if (id) {
    deleteVocabEntry(id);
    showToast('Удалено из словаря');
    closeQuickSave();
  }
});

swPlayBtn.addEventListener('click', () => {
  if (swWord.value.trim()) speakText(swWord.value.trim(), 0.9);
});

saveWordForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addVocabEntry(swWord.value, swTranslation.value, swNote.value);
  closeQuickSave();
});

// --- Вкладка «Словарь и карточки» ---
function switchVocabTab(tab) {
  vocabTab = tab;
  const isNotes = tab === 'notes';
  tabNotes.classList.toggle('active', isNotes);
  tabCards.classList.toggle('active', !isNotes);
  notesView.style.display = isNotes ? 'flex' : 'none';
  cardsView.style.display = isNotes ? 'none' : 'flex';

  if (isNotes) renderVocabList();
  else startFlashcardsSession();
}

function renderVocabList() {
  const lang = getCurrentLang();
  if (vocab.length === 0) {
    vocabListEl.innerHTML = `
      <div class="empty-state">
        Словарь (${escapeHtml(lang.nameRu.toLowerCase())}) пока пуст.<br>
        Нажмите на любое незнакомое слово в «Диалоге», «Чтении» или «Грамматике» — либо добавьте его выше.
      </div>
    `;
    return;
  }

  vocabListEl.innerHTML = '';
  for (const item of vocab) {
    const row = document.createElement('div');
    row.className = 'vocab-item';
    row.innerHTML = `
      <div class="vocab-main">
        <div class="vocab-en">${escapeHtml(item.target)}</div>
        <div class="vocab-ru">${escapeHtml(item.ru)}</div>
        ${item.note ? `<div class="vocab-note">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <div class="vocab-actions">
        <button type="button" class="icon-btn play-item" title="Прослушать">▶</button>
        <button type="button" class="icon-btn del-item" title="Удалить">✕</button>
      </div>
    `;
    row.querySelector('.play-item').addEventListener('click', () => speakText(item.target, 0.9));
    row.querySelector('.del-item').addEventListener('click', () => deleteVocabEntry(item.id));
    vocabListEl.appendChild(row);
  }
}

function startFlashcardsSession() {
  const lang = getCurrentLang();
  if (vocab.length === 0) {
    cardsView.innerHTML = `
      <div class="empty-state">
        Чтобы учить слова (${escapeHtml(lang.nameRu.toLowerCase())}) по карточкам, сначала сохраните хотя бы одно слово в заметки.
      </div>
    `;
    return;
  }

  fcQueue = [...vocab].sort(() => Math.random() - 0.5);
  fcTotal = fcQueue.length;
  fcKnown = 0;
  fcFlipped = false;
  renderFlashcard();
}

function renderFlashcard() {
  if (fcQueue.length === 0) {
    awardXp(15, true);
    cardsView.innerHTML = `
      <div class="empty-state">
        <div style="font-size:28px; margin-bottom:8px;">✓</div>
        <strong>Все карточки пройдены!</strong><br>
        Вы повторили ${fcTotal} ${pluralWords(fcTotal)}.
        <div style="margin-top:16px;">
          <button type="button" id="fcRestartBtn" class="primary-btn">Повторить заново</button>
        </div>
      </div>
    `;
    cardsView.querySelector('#fcRestartBtn').addEventListener('click', startFlashcardsSession);
    return;
  }

  const lang = getCurrentLang();
  const current = fcQueue[0];
  const showTargetFront = fcDirection === 'target-ru';
  const frontLang = showTargetFront ? lang.nativeName : 'Русский';
  const backLang = showTargetFront ? 'Русский' : lang.nativeName;
  const frontText = showTargetFront ? current.target : current.ru;
  const backText = showTargetFront ? current.ru : current.target;

  cardsView.innerHTML = `
    <div class="fc-top">
      <span>Изучено: ${fcKnown} из ${fcTotal}</span>
      <button type="button" id="fcDirBtn" class="chip-btn">${showTargetFront ? `${escapeHtml(lang.short)} → RU` : `RU → ${escapeHtml(lang.short)}`}</button>
    </div>
    <div id="fcCard" class="fc-card ${fcFlipped ? 'flipped' : ''}">
      <div class="fc-lang">${escapeHtml(fcFlipped ? backLang : frontLang)}</div>
      <div class="fc-word">${escapeHtml(fcFlipped ? backText : frontText)}</div>
      ${fcFlipped && current.note ? `<div class="fc-note">${escapeHtml(current.note)}</div>` : ''}
      <button type="button" id="fcPlayBtn" class="chip-btn">▶ Произношение</button>
      <div class="fc-hint">${fcFlipped ? 'Нажмите, чтобы повернуть обратно' : 'Нажмите на карточку, чтобы увидеть ответ'}</div>
    </div>
    <div class="fc-controls">
      <button type="button" id="fcAgainBtn" class="fc-btn-again">Повторить позже</button>
      <button type="button" id="fcKnowBtn" class="fc-btn-know">Знаю</button>
    </div>
  `;

  cardsView.querySelector('#fcDirBtn').addEventListener('click', () => {
    fcDirection = fcDirection === 'target-ru' ? 'ru-target' : 'target-ru';
    fcFlipped = false;
    renderFlashcard();
  });

  cardsView.querySelector('#fcPlayBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    speakText(current.target, 0.9);
  });

  cardsView.querySelector('#fcCard').addEventListener('click', () => {
    fcFlipped = !fcFlipped;
    renderFlashcard();
  });

  cardsView.querySelector('#fcAgainBtn').addEventListener('click', () => {
    const card = fcQueue.shift();
    fcQueue.push(card);
    fcFlipped = false;
    renderFlashcard();
  });

  cardsView.querySelector('#fcKnowBtn').addEventListener('click', () => {
    fcQueue.shift();
    fcKnown += 1;
    fcFlipped = false;
    renderFlashcard();
  });
}

function pluralWords(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слова';
  return 'слов';
}

tabNotes.addEventListener('click', () => switchVocabTab('notes'));
tabCards.addEventListener('click', () => switchVocabTab('cards'));

manualAddForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addVocabEntry(manualTarget.value, manualRu.value, manualNote.value);
  manualTarget.value = '';
  manualRu.value = '';
  manualNote.value = '';
  renderVocabList();
});

// --- Озвучка (TTS под выбранный язык) ---
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  availableVoices = window.speechSynthesis.getVoices() || [];
}

if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function getVoiceForCurrentLang() {
  const lang = getCurrentLang();
  const prefix = lang.code.toLowerCase();
  const exact = lang.ttsLang.toLowerCase();
  const matching = availableVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
  if (matching.length === 0) return null;

  return (
    matching.find(v => /google|microsoft|natural|online/i.test(v.name) && v.lang.toLowerCase() === exact) ||
    matching.find(v => /google|natural|samantha|thomas|amélie|monica|anna|yuna|kyoko/i.test(v.name)) ||
    matching.find(v => v.lang.toLowerCase() === exact) ||
    matching[0]
  );
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (activeVoiceBar) {
    activeVoiceBar.classList.remove('playing');
    const btn = activeVoiceBar.querySelector('.play-btn');
    if (btn) btn.innerHTML = playSvg();
    activeVoiceBar = null;
  }
  if (activeReadingPlayBtn) {
    activeReadingPlayBtn.classList.remove('open');
    activeReadingPlayBtn.textContent = '▶ Слушать текст';
    activeReadingPlayBtn = null;
  }
}

function speakText(text, rate = 1.0, voiceBarEl = null, readingBtnEl = null) {
  if (!('speechSynthesis' in window) || !text) return;

  if (voiceBarEl && activeVoiceBar === voiceBarEl) {
    stopSpeech();
    return;
  }

  stopSpeech();
  const lang = getCurrentLang();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang.ttsLang;
  utter.rate = rate;

  const voice = getVoiceForCurrentLang();
  if (voice) utter.voice = voice;

  if (voiceBarEl) {
    activeVoiceBar = voiceBarEl;
    voiceBarEl.classList.add('playing');
    const btn = voiceBarEl.querySelector('.play-btn');
    if (btn) btn.innerHTML = stopSvg();
  }

  if (readingBtnEl) {
    activeReadingPlayBtn = readingBtnEl;
    readingBtnEl.classList.add('open');
    readingBtnEl.textContent = '■ Остановить';
  }

  utter.onend = () => {
    if (voiceBarEl) {
      voiceBarEl.classList.remove('playing');
      const btn = voiceBarEl.querySelector('.play-btn');
      if (btn) btn.innerHTML = playSvg();
    }
    if (readingBtnEl) {
      readingBtnEl.classList.remove('open');
      readingBtnEl.textContent = '▶ Слушать текст';
    }
    if (activeVoiceBar === voiceBarEl) activeVoiceBar = null;
    if (activeReadingPlayBtn === readingBtnEl) activeReadingPlayBtn = null;
  };

  utter.onerror = utter.onend;
  window.speechSynthesis.speak(utter);
}

function primeSpeech() {
  if ('speechSynthesis' in window) {
    const silent = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(silent);
  }
}

// --- Вспомогательные функции (поддержка всех алфавитов) ---
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderClickableText(text) {
  const str = String(text || '');
  const lang = getCurrentLang();

  // Для китайского и японского разбиваем текст через встроенный Intl.Segmenter
  if (lang.useSegmenter && typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter(lang.code, { granularity: 'word' });
      let out = '';
      for (const seg of segmenter.segment(str)) {
        if (seg.isWordLike) {
          const w = seg.segment;
          const savedCls = isWordSaved(w) ? ' saved' : '';
          out += `<span class="clickable-word${savedCls}" data-word="${escapeHtml(w)}">${escapeHtml(w)}</span>`;
        } else {
          out += escapeHtml(seg.segment);
        }
      }
      return out;
    } catch (_) {}
  }

  // Для европейских языков (включая французские акценты/апострофы) и корейского
  const regex = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
  let out = '';
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(str.slice(lastIndex, match.index));
    }
    const w = match[0];
    const savedCls = isWordSaved(w) ? ' saved' : '';
    out += `<span class="clickable-word${savedCls}" data-word="${escapeHtml(w)}">${escapeHtml(w)}</span>`;
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < str.length) {
    out += escapeHtml(str.slice(lastIndex));
  }
  return out;
}

function playSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
}

function stopSvg() {
  return '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setBusy(state, label = '') {
  isBusy = state;
  micBtn.disabled = state;
  sendTextBtn.disabled = state;
  const existing = document.getElementById('loadingNote');
  if (existing) existing.remove();

  if (state && label) {
    const note = document.createElement('div');
    note.id = 'loadingNote';
    note.className = 'status-note';
    note.textContent = label;
    chatEl.appendChild(note);
    scrollToBottom();
  }
}

function showError(msg) {
  const el = document.createElement('div');
  el.className = 'error-banner';
  el.textContent = msg;
  chatEl.appendChild(el);
  scrollToBottom();
}

// --- Отрисовка сообщений диалога ---
function renderAiMessage(replyTarget, replyRu) {
  const group = document.createElement('div');
  group.className = 'msg-group ai';

  const heights = [8, 16, 12, 20, 10, 18, 14, 22, 11, 16, 9, 14];
  const waveBars = heights.map(h => `<span style="height:${h}px"></span>`).join('');

  let currentRate = 1.0;

  group.innerHTML = `
    <div class="bubble">
      <div class="voice-bar">
        <button type="button" class="play-btn" title="Прослушать">${playSvg()}</button>
        <div class="wave">${waveBars}</div>
        <button type="button" class="speed-btn" title="Скорость речи">1.0x</button>
      </div>
      <div class="toggle-row">
        <button type="button" class="chip-btn" data-toggle="target">Текст</button>
        <button type="button" class="chip-btn" data-toggle="ru">Перевод</button>
      </div>
      <div class="hidden-box target">
        ${renderClickableText(replyTarget)}
        <span class="word-tap-hint">Нажмите на любое слово, чтобы перевести и сохранить в заметки</span>
      </div>
      <div class="hidden-box ru">${escapeHtml(replyRu)}</div>
    </div>
  `;

  const voiceBar = group.querySelector('.voice-bar');
  const playBtn = group.querySelector('.play-btn');
  const speedBtn = group.querySelector('.speed-btn');
  const targetBox = group.querySelector('.hidden-box.target');
  const ruBox = group.querySelector('.hidden-box.ru');

  playBtn.addEventListener('click', () => speakText(replyTarget, currentRate, voiceBar));

  speedBtn.addEventListener('click', () => {
    currentRate = currentRate === 1.0 ? 0.8 : 1.0;
    speedBtn.textContent = currentRate.toFixed(1) + 'x';
    if (activeVoiceBar === voiceBar) {
      stopSpeech();
      speakText(replyTarget, currentRate, voiceBar);
    }
  });

  group.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.toggle === 'target' ? targetBox : ruBox;
      const isOpen = target.classList.toggle('show');
      btn.classList.toggle('open', isOpen);
      scrollToBottom();
    });
  });

  targetBox.addEventListener('click', (e) => {
    const span = e.target.closest('.clickable-word');
    if (!span) return;
    const word = span.dataset.word;
    if (word) openQuickSave(word, replyTarget);
  });

  chatEl.appendChild(group);
  scrollToBottom();

  if (autoPlay && currentMode === 'chat') {
    speakText(replyTarget, currentRate, voiceBar);
  }
}

function createUserBubble({ audioUrl = null, text = '' }) {
  const group = document.createElement('div');
  group.className = 'msg-group user';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (audioUrl) {
    const audio = document.createElement('audio');
    audio.className = 'user-audio';
    audio.controls = true;
    audio.src = audioUrl;
    bubble.appendChild(audio);
  }

  const transcriptEl = document.createElement('div');
  transcriptEl.className = 'user-transcript' + (audioUrl ? '' : ' only');
  transcriptEl.textContent = text || 'Расшифровка...';
  bubble.appendChild(transcriptEl);

  group.appendChild(bubble);
  chatEl.appendChild(group);
  scrollToBottom();

  return { group, transcriptEl };
}

function appendFeedback(userGroup, data) {
  if (!data.explanationRu && !data.correction) return;

  const card = document.createElement('div');
  if (data.hasErrors && data.correction) {
    card.className = 'feedback fix';
    card.innerHTML = `
      <div class="feedback-top">
        <span class="correction-text">Лучше: ${escapeHtml(data.correction)}</span>
        <div class="feedback-actions">
          <button type="button" class="mini-play play-fix">▶ Послушать</button>
          <button type="button" class="mini-play save-fix">+ В заметки</button>
        </div>
      </div>
      <div>${escapeHtml(data.explanationRu)}</div>
    `;
    card.querySelector('.play-fix').addEventListener('click', () => {
      speakText(data.correction, 0.9);
    });
    card.querySelector('.save-fix').addEventListener('click', () => {
      openQuickSave(data.correction, '', data.explanationRu || '');
    });
  } else {
    card.className = 'feedback ok';
    card.textContent = '✓ ' + (data.explanationRu || 'Отлично, без ошибок!');
  }

  userGroup.appendChild(card);
  scrollToBottom();
}

// --- Запросы к серверу для диалога ---
async function startConversation() {
  stopSpeech();
  history = [];
  chatEl.innerHTML = '';
  const lang = getCurrentLang();
  const seenBucket = `start::${currentLangCode}::${levelSelect.value}::${topicSelect.value}`;
  setBusy(true, `Echo готовит диалог (${lang.nameRu.toLowerCase()})...`);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        language: currentLangCode,
        level: levelSelect.value,
        topic: topicSelect.value,
        seenIds: getSeenIds(seenBucket)
      })
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      showError(data.error || 'Не удалось начать диалог.');
      return;
    }

    const itemId = data.id || data.startId || data.cacheId;
    if (itemId) rememberSeenId(seenBucket, itemId);

    const replyTxt = data.replyTarget || data.replyEn || '';
    history.push({ role: 'model', text: replyTxt });
    renderAiMessage(replyTxt, data.replyRu);
  } catch (_) {
    setBusy(false);
    showError('Ошибка сети. Проверьте подключение и попробуйте ещё раз.');
  }
}

async function sendUserMessage({ audioBlob = null, mimeType = '', text = '' }) {
  const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : null;
  const { group, transcriptEl } = createUserBubble({ audioUrl, text });

  setBusy(true, audioBlob ? 'Echo слушает и разбирает ответ...' : 'Echo думает...');

  try {
    let audioBase64 = '';
    if (audioBlob) {
      audioBase64 = await blobToBase64(audioBlob);
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        language: currentLangCode,
        audioBase64,
        mimeType,
        text,
        level: levelSelect.value,
        topic: topicSelect.value,
        history
      })
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      transcriptEl.textContent = text || 'Не удалось распознать';
      showError(data.error || 'Ошибка сервера.');
      return;
    }

    const finalTranscript = data.userTranscript || text || '—';
    const replyTxt = data.replyTarget || data.replyEn || '';
    transcriptEl.textContent = finalTranscript;
    appendFeedback(group, data);

    awardXp(5, false);

    history.push({ role: 'user', text: finalTranscript });
    history.push({ role: 'model', text: replyTxt });

    renderAiMessage(replyTxt, data.replyRu);
  } catch (_) {
    setBusy(false);
    showError('Ошибка соединения с сервером.');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- Запись голоса ---
function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

async function startRecording() {
  if (isBusy || isRecording) return;
  primeSpeech();
  stopSpeech();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Браузер не поддерживает запись с микрофона. Используйте текстовый ввод или откройте сайт по HTTPS.');
    return;
  }

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (_) {
    showError('Нет доступа к микрофону. Разрешите доступ в настройках браузера.');
    return;
  }

  const mimeType = getSupportedMimeType();
  const options = mimeType ? { mimeType } : undefined;

  try {
    mediaRecorder = new MediaRecorder(activeStream, options);
  } catch (_) {
    mediaRecorder = new MediaRecorder(activeStream);
  }

  audioChunks = [];
  cancelRequested = false;
  isRecording = true;
  recStartTime = Date.now();

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    cleanupRecording();
    if (cancelRequested) return;

    const durationSec = (Date.now() - recStartTime) / 1000;
    if (durationSec < 0.6 || audioChunks.length === 0) {
      hintText.textContent = 'Запись слишком короткая — нажмите и проговорите фразу целиком';
      return;
    }

    const actualMime = mediaRecorder.mimeType || mimeType || 'audio/mp4';
    const blob = new Blob(audioChunks, { type: actualMime });
    sendUserMessage({ audioBlob: blob, mimeType: actualMime });
  };

  mediaRecorder.start();
  updateRecordingUI(true);
  startAudioMeter(activeStream);

  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - recStartTime) / 1000);
    const mins = Math.floor(sec / 60);
    const rem = String(sec % 60).padStart(2, '0');
    recTimer.textContent = `${mins}:${rem}`;
    if (sec >= MAX_SECONDS) {
      stopRecording(false);
    }
  }, 250);
}

function stopRecording(cancel = false) {
  if (!isRecording || !mediaRecorder) return;
  cancelRequested = cancel;
  isRecording = false;
  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function cleanupRecording() {
  clearInterval(timerInterval);
  cancelAnimationFrame(animFrame);
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  updateRecordingUI(false);
}

function updateRecordingUI(recording) {
  micBtn.classList.toggle('recording', recording);
  recInfo.classList.toggle('show', recording);
  cancelRecBtn.style.display = recording ? 'inline-flex' : 'none';
  toTextBtn.style.display = recording ? 'none' : 'inline-flex';
  recTimer.textContent = '0:00';
  meterFill.style.width = '10%';

  if (recording) {
    micIcon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect>';
    hintText.textContent = 'Идёт запись · нажмите ещё раз, чтобы отправить';
  } else {
    micIcon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>';
    hintText.textContent = 'Нажмите на микрофон, чтобы ответить голосом';
  }
}

function startAudioMeter(stream) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      if (!isRecording) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const pct = Math.min(100, Math.max(10, Math.round((avg / 70) * 100)));
      meterFill.style.width = pct + '%';
      animFrame = requestAnimationFrame(loop);
    };
    loop();
  } catch (_) {}
}

// --- Обработчики событий ---
micBtn.addEventListener('click', () => {
  if (isRecording) stopRecording(false);
  else startRecording();
});

cancelRecBtn.addEventListener('click', () => stopRecording(true));

toTextBtn.addEventListener('click', () => {
  voicePanel.style.display = 'none';
  textPanel.classList.add('show');
  hintText.textContent = 'Текстовый режим · ИИ также разберёт ошибки и ответит голосом';
  textInput.focus();
});

toVoiceBtn.addEventListener('click', () => {
  textPanel.classList.remove('show');
  voicePanel.style.display = 'flex';
  hintText.textContent = 'Нажмите на микрофон, чтобы ответить голосом';
});

textPanel.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isBusy) return;
  const val = textInput.value.trim();
  if (!val) return;
  primeSpeech();
  textInput.value = '';
  sendUserMessage({ text: val });
});

autoPlayBtn.addEventListener('click', () => {
  autoPlay = !autoPlay;
  autoPlayBtn.classList.toggle('active', autoPlay);
  if (!autoPlay) stopSpeech();
});

restartBtn.addEventListener('click', () => {
  if (currentMode === 'reading') generateReadingText();
  else if (currentMode === 'grammar') {
    if (activeGrammarTopic) loadGrammarLesson(activeGrammarTopic);
  } else {
    startConversation();
  }
});

levelSelect.addEventListener('change', () => {
  if (currentMode === 'reading') {
    generateReadingText();
  } else if (currentMode === 'grammar') {
    activeGrammarTopic = '';
    grammarLesson = null;
    renderGrammarTopicChips();
  } else if (currentMode === 'chat') {
    startConversation();
  }
});

topicSelect.addEventListener('change', () => {
  if (currentMode === 'reading') {
    customTopicInput.value = '';
    generateReadingText();
  } else if (currentMode === 'chat') {
    startConversation();
  }
});

// --- Старт приложения ---
const savedTheme = (() => {
  try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; }
  catch (_) { return 'light'; }
})();

applyTheme(savedTheme);
initSelects();
vocab = loadVocab();
updateVocabBadge();
updateLanguageLabels();
renderGrammarTopicChips();
startConversation();
