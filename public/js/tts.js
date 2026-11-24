const AUDIO_CACHE_LIMIT = 80;
const MAX_CHUNK_CHARS = 220;

const audioCache = new Map();
let availableVoices = [];
let currentAudio = null;
let currentAbort = null;
let playSessionId = 0;

function loadBrowserVoices() {
  if (!('speechSynthesis' in window)) return;
  availableVoices = window.speechSynthesis.getVoices() || [];
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadBrowserVoices();
  window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
}

function getBrowserVoice(lang) {
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

function splitIntoChunks(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= MAX_CHUNK_CHARS) return [clean];

  const sentences = clean.split(/(?<=[.!?。！？])\s+|\n+/).filter(Boolean);
  const chunks = [];
  let buf = '';

  for (const s of sentences) {
    if (s.length > MAX_CHUNK_CHARS) {
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
      // Разбиваем слишком длинное предложение по запятым или пробелам
      const parts = s.split(/(?<=[,;،、，])\s*/).filter(Boolean);
      let sub = '';
      for (const p of parts) {
        if ((sub + ' ' + p).trim().length <= MAX_CHUNK_CHARS) {
          sub = (sub ? sub + ' ' : '') + p;
        } else {
          if (sub) chunks.push(sub.trim());
          sub = p.length > MAX_CHUNK_CHARS ? p.slice(0, MAX_CHUNK_CHARS) : p;
        }
      }
      if (sub) chunks.push(sub.trim());
      continue;
    }

    if ((buf ? buf + ' ' + s : s).length <= MAX_CHUNK_CHARS) {
      buf = buf ? `${buf} ${s}` : s;
    } else {
      if (buf) chunks.push(buf);
      buf = s;
    }
  }

  if (buf) chunks.push(buf);
  return chunks;
}

function getCachedUrl(key) {
  if (!audioCache.has(key)) return null;
  const val = audioCache.get(key);
  audioCache.delete(key);
  audioCache.set(key, val);
  return val;
}

function setCachedUrl(key, url) {
  audioCache.set(key, url);
  while (audioCache.size > AUDIO_CACHE_LIMIT) {
    const oldestKey = audioCache.keys().next().value;
    const oldUrl = audioCache.get(oldestKey);
    audioCache.delete(oldestKey);
    try { URL.revokeObjectURL(oldUrl); } catch (_) {}
  }
}

async function fetchAudioUrl(chunk, langCode, signal) {
  const key = `${langCode}::${chunk}`;
  const cached = getCachedUrl(key);
  if (cached) return cached;

  const qs = new URLSearchParams({ lang: langCode, text: chunk });
  const res = await fetch(`/api/tts?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

  const blob = await res.blob();
  if (!blob || blob.size < 100) throw new Error('Empty audio');

  const url = URL.createObjectURL(blob);
  setCachedUrl(key, url);
  return url;
}

function playAudioUrl(url, rate, sessionId) {
  return new Promise((resolve, reject) => {
    if (sessionId !== playSessionId) {
      resolve('cancelled');
      return;
    }

    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    currentAudio = audio;

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve('ended');
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      reject(new Error('Audio playback error'));
    };

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (currentAudio === audio) currentAudio = null;
        reject(err);
      });
    }
  });
}

function speakWithBrowserFallback(text, lang, rate, sessionId, onFinish) {
  if (!('speechSynthesis' in window) || !text || sessionId !== playSessionId) {
    onFinish();
    return;
  }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang.ttsLang;
  utter.rate = rate;

  const voice = getBrowserVoice(lang);
  if (voice) utter.voice = voice;

  const done = () => {
    if (sessionId === playSessionId) onFinish();
  };
  utter.onend = done;
  utter.onerror = done;
  window.speechSynthesis.speak(utter);
}

export function stopNeuralSpeech() {
  playSessionId += 1;

  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_) {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function setLivePlaybackRate(rate) {
  if (currentAudio) {
    currentAudio.playbackRate = rate;
  }
}

export function primeBrowserAudio() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    } catch (_) {}
  }
}

export async function playNeuralSpeech({ text, lang, rate = 1.0, onFinish = () => {} }) {
  stopNeuralSpeech();

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    onFinish();
    return;
  }

  const sessionId = playSessionId;
  const controller = new AbortController();
  currentAbort = controller;

  try {
    let nextUrlPromise = fetchAudioUrl(chunks[0], lang.code, controller.signal);

    for (let i = 0; i < chunks.length; i += 1) {
      if (sessionId !== playSessionId) return;

      const url = await nextUrlPromise;
      if (sessionId !== playSessionId) return;

      // Пока проигрывается текущее предложение — заранее подгружаем следующее
      if (i + 1 < chunks.length) {
        nextUrlPromise = fetchAudioUrl(chunks[i + 1], lang.code, controller.signal);
      }

      await playAudioUrl(url, rate, sessionId);
    }

    if (sessionId === playSessionId) onFinish();
  } catch (err) {
    if (sessionId !== playSessionId || err?.name === 'AbortError') return;

    // Если браузер заблокировал автовоспроизведение до клика пользователя — просто снимаем статус без робота
    if (err?.name === 'NotAllowedError') {
      onFinish();
      return;
    }

    // Если сервер TTS недоступен — плавно откатываемся на встроенный голос браузера
    speakWithBrowserFallback(text, lang, rate, sessionId, onFinish);
  }
}
