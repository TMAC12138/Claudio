import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const STATE_FILE = '/private/tmp/claudio-ncm-login/netease-login-key.json';
const COOKIE_FILE = join(PROJECT_ROOT, '.claudio-run', 'ncm-cookie.txt');
const baseUrl = process.env.NCM_BASE_URL || 'http://127.0.0.1:3001';

if (!existsSync(STATE_FILE)) {
  console.error('没有找到二维码状态文件，请先重新生成二维码。');
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
const res = await fetch(`${baseUrl}/login/qr/check?key=${encodeURIComponent(state.key)}&timestamp=${Date.now()}&ua=pc`);
const data = await res.json();

if (data.code !== 803 || !data.cookie) {
  console.error(`扫码尚未完成或已过期，当前状态: ${data.code || 'unknown'} ${data.message || ''}`.trim());
  process.exit(1);
}

mkdirSync(dirname(COOKIE_FILE), { recursive: true });
writeFileSync(COOKIE_FILE, `${toRequestCookie(data.cookie)}\n`);
chmodSync(COOKIE_FILE, 0o600);
console.log(`登录态已保存: ${COOKIE_FILE}`);

function toRequestCookie(setCookieText) {
  const wanted = new Set(['MUSIC_U', '__csrf', 'MUSIC_R_U', 'MUSIC_R_T', 'MUSIC_A_T', 'NMTID']);
  const cookies = new Map();
  const pattern = /(?:^|[;,]\s*)([^=;\s]+)=([^;,\s]*)/g;
  let match;

  while ((match = pattern.exec(setCookieText))) {
    const [, name, value] = match;
    if (wanted.has(name) && value) cookies.set(name, value);
  }

  cookies.set('os', 'pc');
  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ');
}
