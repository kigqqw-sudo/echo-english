const MAX_CHUNK_CHARS = 220;
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const sharedAudio = typeof Audio !== 'undefined' ? new Audio() : null;
if (sharedAudio) {
  sharedAudio.preload = 'auto';
  sharedAudio.playsInline = true;
  sharedAudio.setAttribute('playsinline', '');
}

let availableVoices = [];
let audioUnlocked = false;
let isPlayingNeural = false;
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

function buildTtsUrl(chunk, langCode) {
  const qs = new URLSearchParams({ lang: langCode, text: chunk });
  return `/api/tts?${qs.toString()}`;
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
  if (!sharedAudio || audioUnlocked || isPlayingNeural) return;
  try {
    sharedAudio.onplay = null;
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    sharedAudio.src = SILENT_WAV;
    const p = sharedAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (!isPlayingNeural) sharedAudio.pause();
        audioUnlocked = true;
      }).catch(() => {});
    }
  } catch (_) {}
}

export function playNeuralSpeech({ text, lang, rate = 1.0, onFinish = () => {} }) {
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

  const playChunk = (index) => {
    if (sessionId !== playSessionId) return;
    if (index >= chunks.length) {
      isPlayingNeural = false;
      onFinish();
      return;
    }

    const url = buildTtsUrl(chunks[index], lang.code);
    isPlayingNeural = true;

    sharedAudio.onplay = () => {
      if (sessionId !== playSessionId) return;
      audioUnlocked = true;
      sharedAudio.playbackRate = rate;
    };

    sharedAudio.onended = () => {
      if (sessionId !== playSessionId) return;
      playChunk(index + 1);
    };

    sharedAudio.onerror = () => {
      if (sessionId !== playSessionId) return;
      isPlayingNeural = false;
      speakWithBrowserFallback(chunks.slice(index).join(' '), lang, rate, sessionId, onFinish);
    };

    sharedAudio.src = url;
    sharedAudio.defaultPlaybackRate = rate;
    sharedAudio.playbackRate = rate;

    // Прогреваем следующее предложение в кэше CDN/браузера, пока играет текущее
    if (index + 1 < chunks.length) {
      fetch(buildTtsUrl(chunks[index + 1], lang.code)).catch(() => {});
    }

    const playPromise = sharedAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (sessionId !== playSessionId) return;
        isPlayingNeural = false;

        // Если мобильный браузер заблокировал автоозвучку до первого тапа — просто снимаем статус
        if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
          onFinish();
          return;
        }

        speakWithBrowserFallback(chunks.slice(index).join(' '), lang, rate, sessionId, onFinish);
      });
    }
  };

  playChunk(0);
}
