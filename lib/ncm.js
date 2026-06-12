import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const urlCache = new Map();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DEFAULT_COOKIE_FILE = join(PROJECT_ROOT, '.claudio-run', 'ncm-cookie.txt');
let baseUrl = 'http://localhost:3001';
let level = 'standard';
let cookieFile = DEFAULT_COOKIE_FILE;

export function configure(config) {
  baseUrl = config.baseUrl || baseUrl;
  level = config.level || level;
  cookieFile = config.cookieFile || process.env.NCM_COOKIE_FILE || cookieFile;
}

async function ncmFetch(path, params = {}) {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = {};
  const cookie = getCookie();
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`NCM API error: ${res.status}`);
  return res.json();
}

function getCookie() {
  if (process.env.NCM_COOKIE) return process.env.NCM_COOKIE;
  if (!cookieFile || !existsSync(cookieFile)) return '';
  return readFileSync(cookieFile, 'utf-8').trim();
}

export async function search(keyword, limit = 5) {
  const data = await ncmFetch('/search', { keywords: keyword, limit: String(limit) });
  const songs = data?.result?.songs || [];
  return songs.map(normalizeSong);
}

export async function getLoginStatus() {
  return ncmFetch('/login/status');
}

export async function getUserPlaylists(uid, { limit = 50, offset = 0 } = {}) {
  const data = await ncmFetch('/user/playlist', {
    uid: String(uid),
    limit: String(limit),
    offset: String(offset),
  });
  return {
    playlists: data?.playlist || [],
    more: Boolean(data?.more),
  };
}

export async function getPlaylistTracks(playlistId, { limit = 1000, offset = 0 } = {}) {
  const data = await ncmFetch('/playlist/track/all', {
    id: String(playlistId),
    limit: String(limit),
    offset: String(offset),
  });
  return (data?.songs || []).map(normalizeSong);
}

export async function getUrl(songId) {
  const cacheKey = String(songId);
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, br: cached.br, source: 'netease', playable: true };
  }

  const item = await fetchUrlItem(songId);
  const status = classifyUrlItem(item);
  if (!status.playable) return { url: null, source: 'netease', ...status };

  const entry = { url: item.url, br: item.br || item.bitrate || 320000, expiresAt: Date.now() + 9 * 60 * 1000 };
  urlCache.set(cacheKey, entry);
  return { url: entry.url, br: entry.br, source: 'netease', playable: true };
}

export async function getLyric(songId) {
  const data = await ncmFetch('/lyric', { id: String(songId) });
  return { lrc: data?.lrc?.lyric || '', tlyric: data?.tlyric?.lyric || '' };
}

export async function resolvePlayableSongs(candidates, limit = 11) {
  const playable = [];
  const seen = new Set();
  const sourceCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : [];

  for (const candidate of sourceCandidates) {
    if (playable.length >= limit) break;
    const song = await tryResolveSong(candidate);
    addPlayable(playable, seen, song);
  }

  // Keep the queue full when recommendations are missing or unavailable.
  for (const candidate of sourceCandidates) {
    if (playable.length >= limit) break;
    const keyword = getRelatedKeyword(candidate);
    if (!keyword) continue;
    const results = await search(keyword, Math.max(limit * 2, 20));
    for (const result of results) {
      if (playable.length >= limit) break;
      addPlayable(playable, seen, await tryResolveSong(result));
    }
  }

  if (playable.length < limit) {
    for (const candidate of getImportedPlaylistTracks()) {
      if (playable.length >= limit) break;
      addPlayable(playable, seen, await tryResolveSong(candidate));
    }
  }

  return playable;
}

// Cleanup expired cache entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of urlCache) {
    if (val.expiresAt < now) urlCache.delete(key);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();

function normalizeSong(song) {
  return {
    id: String(song.id ?? song.song_id ?? song.songmid ?? ''),
    source: 'netease',
    name: song.name || song.song_name || song.title || '',
    artist: normalizeArtists(song),
    album: song.al?.name || song.album?.name || song.album || '',
    duration: song.dt || song.duration || 0,
    cover: song.al?.picUrl || song.album?.picUrl || song.picUrl || '',
    url: song.url || null,
    fee: song.fee,
  };
}

function normalizeArtists(song) {
  const artists = song.ar || song.artists || song.artist;
  if (Array.isArray(artists)) {
    return artists.map(a => a?.name || a).filter(Boolean).join('/');
  }
  return artists || '';
}

async function fetchUrlItem(songId) {
  const id = String(songId);

  try {
    const data = await ncmFetch('/song/url/v1', { id, level });
    const item = data?.data?.[0];
    if (item?.url) return item;
  } catch {}

  const data = await ncmFetch('/song_url', { id });
  return data?.data?.[0];
}

function classifyUrlItem(item) {
  if (!item) return { playable: false, reason: 'no_url_item' };
  if (item.code && item.code !== 200) return { playable: false, reason: `ncm_code_${item.code}`, code: item.code };
  if (!item.url) return { playable: false, reason: 'no_url_available', code: item.code };
  if (item.freeTrialInfo) {
    return {
      playable: false,
      reason: 'trial_only',
      trial: true,
      code: item.code,
      fee: item.fee,
    };
  }
  return { playable: true };
}

async function resolveSong(candidate) {
  let song = typeof candidate === 'string' ? null : normalizeSong(candidate);

  if (!song?.id) {
    const keyword = getKeyword(candidate);
    if (!keyword) return null;
    const results = await search(keyword, 1);
    song = results[0];
  }

  if (!song?.id) return null;
  if (song.url) {
    return {
      ...song,
      sourceUrl: song.url,
      url: `/api/audio/${encodeURIComponent(song.id)}`,
    };
  }

  const resolved = await getUrl(song.id);
  return {
    ...song,
    ...resolved,
    sourceUrl: resolved.url,
    url: resolved.url ? `/api/audio/${encodeURIComponent(song.id)}` : null,
  };
}

async function tryResolveSong(candidate) {
  try {
    return await resolveSong(candidate);
  } catch {
    return null;
  }
}

function getKeyword(candidate) {
  if (typeof candidate === 'string') return candidate.trim();
  return `${candidate.name || candidate.song_name || candidate.title || ''} ${candidate.artist || ''}`.trim();
}

function addPlayable(playable, seen, song) {
  if (!song?.url || !song.id) return;
  const idKey = `id:${song.id}`;
  const nameKey = `name:${normalizeSongName(song.name)}`;
  if (seen.has(idKey) || seen.has(nameKey)) return;
  seen.add(idKey);
  seen.add(nameKey);
  playable.push(song);
}

function getRelatedKeyword(candidate) {
  if (typeof candidate === 'string') return candidate.trim();
  return String(candidate.artist || '').trim() || getKeyword(candidate);
}

function normalizeSongName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（(].*?[）)]/g, '');
}

function getImportedPlaylistTracks() {
  const paths = [
    join(PROJECT_ROOT, 'user', 'netease-playlists.json'),
    join(PROJECT_ROOT, 'user', 'playlists.json'),
  ];

  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      const playlists = Array.isArray(data.playlists) ? data.playlists : [];
      const tracks = playlists.flatMap(playlist => playlist.tracks || []);
      if (tracks.length) return tracks;
    } catch {}
  }

  return [];
}
