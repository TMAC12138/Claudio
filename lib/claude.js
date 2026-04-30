import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let claudePath = 'claude';
let lastSuccessfulResult = null;

export function configure(config) {
  claudePath = config.path || claudePath;
}

export async function ask(prompt, timeout = 30000) {
  try {
    const { stdout } = await execFileAsync(claudePath, [
      '-p', prompt,
      '--output', 'json',
      '--max-turns', '1',
    ], { timeout, env: { ...process.env } });

    const result = parseResponse(stdout);
    lastSuccessfulResult = result;
    return result;
  } catch (err) {
    console.error('[claude.js] Error:', err.message);

    // Timeout or error → try fallback
    if (lastSuccessfulResult) {
      console.log('[claude.js] Falling back to last successful result');
      return { ...lastSuccessfulResult, _fallback: true };
    }

    return {
      say: '抱歉，我暂时无法响应，请稍后再试。',
      play: [],
      reason: 'claude_unavailable',
      segue: '',
    };
  }
}

function parseResponse(stdout) {
  const trimmed = stdout.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    return normalize(parsed);
  } catch {}

  // Try extracting JSON from text
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return normalize(parsed);
    } catch {}
  }

  // Fallback: treat entire text as `say`
  return { say: trimmed, play: [], reason: 'parse_fallback', segue: '' };
}

function normalize(obj) {
  return {
    say: obj.say || '',
    play: Array.isArray(obj.play) ? obj.play : [],
    reason: obj.reason || '',
    segue: obj.segue || '',
  };
}

// SDK mode placeholder (for future migration)
export async function askSdk(prompt) {
  throw new Error('SDK mode not yet implemented. Set CLAUDE_MODE=sdk and install @anthropic-ai/sdk.');
}
