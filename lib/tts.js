import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache', 'tts');

let apiKey = '';
let voiceId = '';

export function configure(config) {
  apiKey = config.apiKey || apiKey;
  voiceId = config.voiceId || voiceId;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function hashText(text) {
  return createHash('md5').update(text).digest('hex');
}

export async function synthesize(text) {
  if (!text || !text.trim()) return { file: null, url: null, error: 'empty text' };

  const hash = hashText(text);
  const filename = `${hash}.mp3`;
  const filePath = join(CACHE_DIR, filename);
  const urlPath = `/tts/${filename}`;

  // Cache hit
  if (existsSync(filePath)) {
    return { file: filePath, url: urlPath, cached: true };
  }

  // Cache miss → call Fish Audio API
  if (!apiKey) return { file: null, url: null, error: 'FISH_API_KEY not configured' };

  try {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reference_id: voiceId,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { file: null, url: null, error: `Fish API ${res.status}: ${body.slice(0, 200)}` };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(filePath, buffer);

    return { file: filePath, url: urlPath, cached: false };
  } catch (err) {
    return { file: null, url: null, error: err.message };
  }
}
