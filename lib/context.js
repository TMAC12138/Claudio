import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import * as weather from './weather.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const LOCAL_TIME_ZONE = 'Asia/Shanghai';

function readProjectFile(relativePath) {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) return '';
  return readFileSync(fullPath, 'utf-8').trim();
}

function getEnvironmentContext() {
  const now = new Date();
  const hours = now.getHours();
  let timeOfDay = '深夜';
  if (hours >= 6 && hours < 9) timeOfDay = '早晨';
  else if (hours >= 9 && hours < 12) timeOfDay = '上午';
  else if (hours >= 12 && hours < 14) timeOfDay = '中午';
  else if (hours >= 14 && hours < 18) timeOfDay = '下午';
  else if (hours >= 18 && hours < 22) timeOfDay = '晚上';

  let env = `当前时间: ${formatLocalDateTime(now)} (${timeOfDay}, 北京时间 UTC+8)`;

  const w = weather.getCachedWeather();
  if (w && !w.error) {
    env += `\n天气: ${w.city} ${w.temp}°C ${w.description}，湿度 ${w.humidity}%`;
  }

  return env;
}

function formatLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(`${value}Z`);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}`;
}

function formatPlays(plays) {
  if (!plays.length) return '暂无播放记录';
  return plays.map(p =>
    `${p.artist} - ${p.song_name} (${formatLocalDateTime(p.played_at)} 北京时间)${p.skipped ? ' [已跳过]' : ''}`
  ).join('\n');
}

function formatMessages(messages) {
  if (!messages.length) return '暂无对话记录';
  return messages.map(m =>
    `${m.role === 'user' ? '用户' : 'DJ'}: ${m.content}`
  ).join('\n');
}

export async function assemble({ input, db: dbModule, ncmResults, trigger }) {
  const fragments = [];

  // 1. System prompt
  fragments.push(`[SYSTEM]\n${readProjectFile('prompts/dj-persona.md')}`);

  // 2. User corpus
  const taste = readProjectFile('user/taste.md');
  if (taste) fragments.push(`[USER TASTE]\n${taste}`);

  const routines = readProjectFile('user/routines.md');
  if (routines) fragments.push(`[ROUTINES]\n${routines}`);

  const moodRules = readProjectFile('user/mood-rules.md');
  if (moodRules) fragments.push(`[MOOD RULES]\n${moodRules}`);

  // 3. Environment
  fragments.push(`[ENVIRONMENT]\n${getEnvironmentContext()}`);

  // 4. Memory
  const plays = db.getRecentPlays(20);
  const messages = db.getRecentMessages(10);
  fragments.push(`[RECENT PLAYS]\n${formatPlays(plays)}`);
  fragments.push(`[CONVERSATION]\n${formatMessages(messages)}`);

  // 5. User input
  fragments.push(`[INPUT]\n${input}`);

  // NCM search results (if any)
  if (ncmResults?.length) {
    fragments.push(`[NCM RESULTS]\n${JSON.stringify(ncmResults, null, 2)}`);
  }

  // 6. Execution trace
  const trace = trigger || { source: 'user', slot: null };
  fragments.push(`[TRACE]\nsource: ${trace.source}${trace.slot ? `, slot: ${trace.slot}` : ''}`);

  return fragments.join('\n\n');
}
