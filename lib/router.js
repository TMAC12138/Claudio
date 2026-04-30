import * as ncm from './ncm.js';
import * as context from './context.js';
import * as claude from './claude.js';
import * as db from './db.js';

const PLAY_PATTERN = /^(?:播放|放一首?|来一首?|play)\s*(.+)/i;
const NEXT_PATTERN = /^(?:下一首?|跳过|skip|换一首?|next)$/i;
const NOW_PATTERN = /^(?:现在放什么|当前播放|正在播放|now playing|now)$/i;

export async function route(input, dbModule) {
  const trimmed = input.trim();

  // 1. Play command: "播放 周杰伦 晴天"
  const playMatch = trimmed.match(PLAY_PATTERN);
  if (playMatch) {
    const keyword = playMatch[1].trim();
    return { type: 'play_direct', data: { keyword } };
  }

  // 2. Control: "下一首"
  if (NEXT_PATTERN.test(trimmed)) {
    return { type: 'next' };
  }

  // 3. Query: "现在放什么"
  if (NOW_PATTERN.test(trimmed)) {
    return { type: 'now' };
  }

  // 4. Default → Claude
  return { type: 'claude', data: { input: trimmed } };
}
