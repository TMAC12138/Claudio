import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as ncm from '../lib/ncm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const OUTPUT_FILE = join(PROJECT_ROOT, 'user', 'netease-playlists.json');

ncm.configure({ baseUrl: process.env.NCM_BASE_URL, level: process.env.NCM_LEVEL });

const playlistLimit = Number(process.env.NCM_IMPORT_PLAYLIST_LIMIT || 200);
const trackLimit = Number(process.env.NCM_IMPORT_TRACK_LIMIT || 1000);

function getProfile(status) {
  const profile = status?.data?.profile;
  const account = status?.data?.account;
  const uid = profile?.userId || account?.id;
  const anonymous = !profile || account?.anonimousUser;
  return { profile, account, uid, anonymous };
}

function normalizePlaylist(playlist, tracks) {
  return {
    id: String(playlist.id),
    name: playlist.name || '',
    subscribed: Boolean(playlist.subscribed),
    trackCount: playlist.trackCount || tracks.length,
    creator: playlist.creator?.nickname || '',
    tracks,
  };
}

async function fetchAllPlaylists(uid) {
  const playlists = [];
  for (let offset = 0; playlists.length < playlistLimit; offset += 50) {
    const result = await ncm.getUserPlaylists(uid, { limit: 50, offset });
    playlists.push(...result.playlists);
    if (!result.more || result.playlists.length === 0) break;
  }
  return playlists.slice(0, playlistLimit);
}

async function main() {
  const status = await ncm.getLoginStatus();
  const { profile, account, uid, anonymous } = getProfile(status);

  if (!uid || anonymous) {
    console.error('当前 NCM 服务还没有登录网易云账号。请先打开 http://localhost:3001/qrlogin.html 扫码登录，再重新运行导入。');
    process.exitCode = 1;
    return;
  }

  const playlists = await fetchAllPlaylists(uid);
  const imported = [];

  for (const playlist of playlists) {
    const tracks = await ncm.getPlaylistTracks(playlist.id, { limit: trackLimit });
    imported.push(normalizePlaylist(playlist, tracks));
    console.log(`已导入: ${playlist.name} (${tracks.length}/${playlist.trackCount || tracks.length})`);
  }

  const doc = {
    source: 'netease',
    generated_at: new Date().toISOString(),
    user: {
      id: String(uid),
      nickname: profile?.nickname || account?.userName || '',
      vipType: account?.vipType ?? null,
    },
    summary: {
      playlists: imported.length,
      tracks: imported.reduce((sum, playlist) => sum + playlist.tracks.length, 0),
    },
    playlists: imported,
  };

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`歌单已写入: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
