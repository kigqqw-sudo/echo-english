import * as msedgeMod from 'msedge-tts';

const MsEdgeTTS = msedgeMod.MsEdgeTTS || msedgeMod.default?.MsEdgeTTS;
const OUTPUT_FORMAT = msedgeMod.OUTPUT_FORMAT || msedgeMod.default?.OUTPUT_FORMAT;

const VOICE_BY_LANG = {
  en: 'en-US-AriaNeural',
  fr: 'fr-FR-DeniseNeural',
  es: 'es-ES-ElviraNeural',
  de: 'de-DE-KatjaNeural',
  it: 'it-IT-ElsaNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural'
};

const MAX_TEXT_LENGTH = 600;
const EDGE_TIMEOUT_MS = 8500;

function sanitizeText(raw) {
  return String(raw || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function synthesizeOpenAI(text) {
  const apiKey = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.TTS_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.TTS_MODEL || 'tts-1';
  const voice = process.env.TTS_VOICE || 'nova';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: 'mp3'
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`OpenAI TTS HTTP ${res.status}`);
    }

    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeEdge(text, langCode) {
  if (!MsEdgeTTS || !OUTPUT_FORMAT) {
    throw new Error('msedge-tts недоступен');
  }

  const voice = VOICE_BY_LANG[langCode] || VOICE_BY_LANG.en;
  const tts = new MsEdgeTTS();

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('TTS timeout')), EDGE_TIMEOUT_MS);
  });

  const synthPromise = (async () => {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const result = tts.toStream(text);
    const stream = result?.audioStream || result;

    return await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 100) reject(new Error('Empty audio buffer'));
        else resolve(buf);
      });
      stream.on('error', reject);
    });
  })();

  try {
    return await Promise.race([synthPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
    try {
      if (typeof tts.close === 'function') tts.close();
    } catch (_) {}
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawText = req.method === 'GET' ? req.query?.text : req.body?.text;
  const rawLang = req.method === 'GET' ? req.query?.lang : req.body?.lang;

  const text = sanitizeText(rawText);
  const lang = VOICE_BY_LANG[String(rawLang || '').toLowerCase()] ? String(rawLang).toLowerCase() : 'en';

  if (!text) {
    res.status(400).json({ error: 'Пустой текст для озвучки' });
    return;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: `Слишком длинный фрагмент (макс. ${MAX_TEXT_LENGTH} символов)` });
    return;
  }

  try {
    let audioBuffer = null;

    if (process.env.TTS_API_KEY || process.env.OPENAI_API_KEY) {
      try {
        audioBuffer = await synthesizeOpenAI(text);
      } catch (_) {
        audioBuffer = null;
      }
    }

    if (!audioBuffer) {
      audioBuffer = await synthesizeEdge(text, lang);
    }

    const total = audioBuffer.length;
    const rangeHeader = req.headers.range;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;

        if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end && start < total) {
          const slice = audioBuffer.subarray(start, end + 1);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', String(slice.length));
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.status(206).send(slice);
          return;
        }
      }
    }

    res.setHeader('Content-Length', String(total));
    res.setHeader('Cache-Control', 'public, s-maxage=2592000, max-age=86400, stale-while-revalidate=86400');
    res.status(200).send(audioBuffer);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Не удалось синтезировать речь', detail: err?.message || 'TTS error' });
  }
}
