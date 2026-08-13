import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as db from '../lib/db.js';
import * as ncm from '../lib/ncm.js';

const execFileAsync = promisify(execFile);

async function checkClaudeCli() {
  const claudePath = process.env.CLAUDE_PATH || 'claude';
  try {
    const { stdout } = await execFileAsync(claudePath, ['--version']);
    return { ok: true, detail: stdout.trim() };
  } catch (err) {
    return { ok: false, detail: `Claude CLI 不可用: ${err.message}` };
  }
}

async function checkDatabase() {
  try {
    const instance = db.initDb();
    const result = instance.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    return { ok: true, detail: `SQLite 正常，包含 ${result.length} 张表` };
  } catch (err) {
    return { ok: false, detail: `SQLite 异常: ${err.message}` };
  }
}

async function checkNcmApi() {
  const baseUrl = process.env.NCM_BASE_URL || 'http://localhost:3001';
  ncm.configure({ baseUrl });
  try {
    await ncm.getLoginStatus();
    return { ok: true, detail: `NCM API 正常 (${baseUrl})` };
  } catch (err) {
    return { ok: false, detail: `NCM API 无法连接 (${baseUrl}): ${err.message}` };
  }
}

function checkTtsAndWeather() {
  const hasMimo = Boolean(process.env.MIMO_API_KEY);
  const hasWeather = Boolean(process.env.WEATHER_API_KEY);
  return {
    mimo: hasMimo ? 'MiMo TTS Key 已配置' : 'MiMo TTS Key 未配置 (跳过语音播报)',
    weather: hasWeather ? 'OpenWeather Key 已配置' : 'OpenWeather Key 未配置 (跳过天气)',
  };
}

async function main() {
  console.log('====== Claudio 系统健康度检查 ======\n');

  const claude = await checkClaudeCli();
  console.log(`[Claude CLI]  ${claude.ok ? '✓ PASS' : '✗ FAIL'} - ${claude.detail}`);

  const database = await checkDatabase();
  console.log(`[数据库]      ${database.ok ? '✓ PASS' : '✗ FAIL'} - ${database.detail}`);

  const ncmApi = await checkNcmApi();
  console.log(`[NCM API]     ${ncmApi.ok ? '✓ PASS' : '✗ FAIL'} - ${ncmApi.detail}`);

  const optional = checkTtsAndWeather();
  console.log(`[TTS]         ℹ INFO - ${optional.mimo}`);
  console.log(`[天气服务]    ℹ INFO - ${optional.weather}`);

  console.log('\n====================================');
}

main().catch(err => {
  console.error('检查脚本出现异常:', err);
  process.exitCode = 1;
});
