import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'tts');
const DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1';

let apiKey = '';
let baseUrl = DEFAULT_BASE_URL;
let model = 'mimo-v2.5-tts';
let voice = '茉莉';
let style = '温暖自然的中文私人电台女声，语速适中，表达松弛而有陪伴感。';

export function configure(config) {
  apiKey = config.apiKey || apiKey;
  baseUrl = config.baseUrl || baseUrl;
  model = config.model || model;
  voice = config.voice || voice;
  style = config.style || style;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function hashRequest(text) {
  return createHash('sha256')
    .update(JSON.stringify({ model, voice, style, text }))
    .digest('hex');
}

export async function synthesize(text) {
  if (!text || !text.trim()) return { file: null, url: null, error: 'empty text' };

  const filename = `${hashRequest(text)}.wav`;
  const filePath = join(CACHE_DIR, filename);
  const urlPath = `/tts/${filename}`;

  if (existsSync(filePath)) {
    return { file: filePath, url: urlPath, cached: true };
  }

  if (!apiKey) return { file: null, url: null, error: 'MIMO_API_KEY not configured' };

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: style },
          { role: 'assistant', content: text.trim() },
        ],
        audio: {
          format: 'wav',
          voice,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      return { file: null, url: null, error: `MiMo API ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = await res.json();
    const base64Audio = data?.choices?.[0]?.message?.audio?.data;
    if (!base64Audio) {
      return { file: null, url: null, error: 'MiMo API response missing audio data' };
    }

    const buffer = Buffer.from(base64Audio, 'base64');
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      return { file: null, url: null, error: 'MiMo API returned invalid WAV audio' };
    }

    writeFileSync(filePath, buffer);
    return { file: filePath, url: urlPath, cached: false };
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'MiMo API request timed out' : err.message;
    return { file: null, url: null, error: message };
  }
}
