import 'dotenv/config';
import * as ncm from '../lib/ncm.js';

ncm.configure({ baseUrl: process.env.NCM_BASE_URL, level: process.env.NCM_LEVEL });

const keywords = process.argv.slice(2);

function getLoginSummary(status) {
  const profile = status?.data?.profile;
  const account = status?.data?.account;
  if (!profile || account?.anonimousUser) return '未登录，当前是匿名账号';
  const vip = account?.vipType ? `VIP 类型 ${account.vipType}` : '未识别到 VIP';
  return `${profile.nickname || account.userName || account.id}，${vip}`;
}

async function checkKeyword(keyword) {
  const [song] = await ncm.search(keyword, 1);
  if (!song) return { keyword, status: 'not_found' };

  const resolved = await ncm.getUrl(song.id);
  return {
    keyword,
    id: song.id,
    name: song.name,
    artist: song.artist,
    status: resolved.playable ? 'playable' : resolved.reason || 'unplayable',
    br: resolved.br || null,
    urlHost: resolved.url ? new URL(resolved.url).host : null,
  };
}

async function main() {
  const status = await ncm.getLoginStatus();
  console.log(`账号状态: ${getLoginSummary(status)}`);

  if (!keywords.length) {
    console.log('用法: npm run ncm:check -- "周杰伦 晴天" "邓紫棋 光年之外"');
    return;
  }

  for (const keyword of keywords) {
    const result = await checkKeyword(keyword);
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
