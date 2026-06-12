import { spawn } from 'child_process';

let claudePath = 'claude';
const DJ_SYSTEM_PROMPT = [
  '你是 Claudio 私人 AI DJ。',
  '不要使用任何工具，不要查询文件、仓库、记忆或网络。',
  '只根据用户输入和已提供的上下文直接返回 JSON。',
  'JSON 字段必须是 say、play、reason、segue，其中 play 必须是歌曲对象数组。',
].join('\n');

export function configure(config) {
  claudePath = config.path || claudePath;
}

export async function ask(prompt, timeout = 60000) {
  try {
    const stdout = await runClaude(prompt, timeout);

    return parseResponse(stdout);
  } catch (err) {
    console.error('[claude.js] Error:', err.message);

    const timedOut = err.message.includes('timed out');
    return {
      say: timedOut
        ? '这次 AI 响应超时了，没有生成新的回答，请稍后再试。'
        : 'AI 服务暂时不可用，没有生成新的回答，请稍后再试。',
      play: [],
      reason: timedOut ? 'claude_timeout' : 'claude_unavailable',
      segue: '',
      _fallback: true,
    };
  }
}

function runClaude(prompt, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, [
      '--output-format', 'json',
      '--max-turns', '1',
      '--system-prompt', DJ_SYSTEM_PROMPT,
      '--tools', '',
      '-p', prompt,
    ], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(reject, new Error(`Claude CLI timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => finish(reject, err));
    child.on('close', (code, signal) => {
      if (code === 0) return finish(resolve, stdout);
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      finish(reject, new Error(`Claude CLI failed with ${reason}: ${(stderr || stdout).trim()}`));
    });
  });
}

function parseResponse(stdout) {
  const trimmed = stdout.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.result === 'string') return parseResponse(parsed.result);
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
    play: normalizePlay(obj.play),
    reason: obj.reason || '',
    segue: obj.segue || '',
  };
}

function normalizePlay(play) {
  if (Array.isArray(play)) return play;
  if (typeof play === 'string' && play.trim()) return [{ name: play.trim() }];
  return [];
}

// SDK mode placeholder (for future migration)
export async function askSdk(prompt) {
  throw new Error('SDK mode not yet implemented. Set CLAUDE_MODE=sdk and install @anthropic-ai/sdk.');
}
