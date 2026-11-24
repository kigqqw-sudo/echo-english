const AUDIO_CACHE_LIMIT = 80;
const MAX_CHUNK_CHARS = 220;
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const audioCache = new Map();
const sharedAudio = typeof Audio !== 'undefined' ? new Audio() : null;
if (sharedAudio) {
  sharedAudio.preload = 'auto';
  sharedAudio.playsInline = true;
  sharedAudio.setAttribute('playsinline', '');
}

let availableVoices = [];
let audioUnlocked = false;
let isPlayingNeural = false;
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

// Разблокируем единый <audio>-элемент при первом касании экрана на телефоне
function unlockSharedAudioSync() {
  if (!sharedAudio || audioUnlocked || isPlayingNeural) return;
  try {
    sharedAudio.onplay = null;
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    sharedAudio.src = SILENT_WAV;
    const p = sharedAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        audioUnlocked = true;
      }).catch(() => {});
    }
  } catch (_) {}
}

if (typeof window !== 'undefined') {
  const onFirstGesture = () => {
    unlockSharedAudioSync();
    if (audioUnlocked) {
      window.removeEventListener('touchstart', onFirstGesture);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('click', onFirstGesture);
    }
  };
  window.addEventListener('touchstart', onFirstGesture, { passive: true });
  window.addEventListener('pointerdown', onFirstGesture, { passive: true });
  window.addEventListener('click', onFirstGesture, { passive: true });
}

function notifyFallback(reason) {
  const toastEl = typeof document !== 'undefined' ? document.getElementById('toast') : null;
  if (!toastEl) return;
  toastEl.textContent = `Включён голос устройства (${reason})`;
  toastEl.classList.add('show');
  clearTimeout(notifyFallback._t);
  notifyFallback._t = setTimeout(() => toastEl.classList.remove('show'), 2500);
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
    if (oldUrl !== sharedAudio?.src) {
      try { URL.revokeObjectURL(oldUrl); } catch (_) {}
    }
  }
}

async function fetchAudioBlobUrl(chunk, langCode, signal) {
  const key = `${langCode}::${chunk}`;
  const cached = getCachedUrl(key);
  if (cached) return cached;

  const qs = new URLSearchParams({ lang: langCode, text: chunk });
  const res = await fetch(`/api/tts?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const blob = await res.blob();
  if (!blob || blob.size < 100) throw new Error('пустой файл');

  const url = URL.createObjectURL(blob);
  setCachedUrl(key, url);
  return url;
}

function playBlobOnSharedAudio(blobUrl, rate, sessionId) {
  return new Promise((resolve, reject) => {
    if (sessionId !== playSessionId || !sharedAudio) {
      resolve('cancelled');
      return;
    }

    isPlayingNeural = true;

    sharedAudio.onplay = () => {
      if (sessionId !== playSessionId) return;
      audioUnlocked = true;
      sharedAudio.playbackRate = rate;
    };

    sharedAudio.onended = () => {
      if (sessionId !== playSessionId) return;
      isPlayingNeural = false;
      resolve('ended');
    };

    sharedAudio.onerror = () => {
      if (sessionId !== playSessionId) return;
      isPlayingNeural = false;
      reject(new Error('ошибка плеера'));
    };

    sharedAudio.src = blobUrl;
    sharedAudio.load();
    sharedAudio.defaultPlaybackRate = rate;
    sharedAudio.playbackRate = rate;

    const p = sharedAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (sessionId !== playSessionId) return;
        isPlayingNeural = false;
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
  isPlayingNeural = false;

  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }

  if (sharedAudio) {
    sharedAudio.onplay = null;
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    try {
      sharedAudio.pause();
    } catch (_) {}
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function setLivePlaybackRate(rate) {
  if (sharedAudio) {
    sharedAudio.defaultPlaybackRate = rate;
    sharedAudio.playbackRate = rate;
  }
}

export function primeBrowserAudio() {
  unlockSharedAudioSync();
}

export async function playNeuralSpeech({ text, lang, rate = 1.0, onFinish = () => {} }) {
  stopNeuralSpeech();

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    onFinish();
    return;
  }

  const sessionId = playSessionId;

  if (!sharedAudio) {
    speakWithBrowserFallback(text, lang, rate, sessionId, onFinish);
    return;
  }

  // Синхронно разблокируем <audio> прямо в момент клика, ДО сетевого fetch()
  const firstKey = `${lang.code}::${chunks[0]}`;
  if (!getCachedUrl(firstKey) && !audioUnlocked) {
    unlockSharedAudioSync();
  }

  const controller = new AbortController();
  currentAbort = controller;

  try {
    let nextUrlPromise = fetchAudioBlobUrl(chunks[0], lang.code, controller.signal);

    for (let i = 0; i < chunks.length; i += 1) {
      if (sessionId !== playSessionId) return;

      const blobUrl = await nextUrlPromise;
      if (sessionId !== playSessionId) return;

      if (i + 1 < chunks.length) {
        nextUrlPromise = fetchAudioBlobUrl(chunks[i + 1], lang.code, controller.signal);
      }

      await playBlobOnSharedAudio(blobUrl, rate, sessionId);
    }

    if (sessionId === playSessionId) onFinish();
  } catch (err) {
    if (sessionId !== playSessionId || err?.name === 'AbortError') return;

    if (err?.name === 'NotAllowedError') {
      onFinish();
      return;
    }

    notifyFallback(err?.message || 'сеть');
    speakWithBrowserFallback(text, lang, rate, sessionId, onFinish);
  }
}
