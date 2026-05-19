const urlCache = new Map();
let baseUrl = 'http://localhost:3001';
let level = 'standard';

export function configure(config) {
  baseUrl = config.baseUrl || baseUrl;
  level = config.level || level;
}

async function ncmFetch(path, params = {}) {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NCM API error: ${res.status}`);
  return res.json();
}

export async function search(keyword, limit = 5) {
  const data = await ncmFetch('/search', { keywords: keyword, limit: String(limit) });
  const songs = data?.result?.songs || [];
  return songs.map(normalizeSong);
}

export async function getUrl(songId) {
  const cacheKey = String(songId);
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, br: cached.br, source: 'netease' };
  }

  const item = await fetchUrlItem(songId);
  if (!item?.url) return { url: null, error: 'No URL available' };

  const entry = { url: item.url, br: item.br || item.bitrate || 320000, expiresAt: Date.now() + 9 * 60 * 1000 };
  urlCache.set(cacheKey, entry);
  return { url: entry.url, br: entry.br, source: 'netease' };
}

export async function getLyric(songId) {
  const data = await ncmFetch('/lyric', { id: String(songId) });
  return { lrc: data?.lrc?.lyric || '', tlyric: data?.tlyric?.lyric || '' };
}

export async function resolvePlayableSongs(candidates, limit = 3) {
  const playable = [];
  for (const candidate of candidates.slice(0, limit)) {
    const song = await resolveSong(candidate);
    if (song?.url) playable.push(song);
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

async function resolveSong(candidate) {
  let song = typeof candidate === 'string' ? null : normalizeSong(candidate);

  if (!song?.id) {
    const keyword = getKeyword(candidate);
    if (!keyword) return null;
    const results = await search(keyword, 1);
    song = results[0];
  }

  if (!song?.id) return null;
  if (song.url) return song;

  const { url, br } = await getUrl(song.id);
  return { ...song, url, br };
}

function getKeyword(candidate) {
  if (typeof candidate === 'string') return candidate.trim();
  return `${candidate.name || candidate.song_name || candidate.title || ''} ${candidate.artist || ''}`.trim();
}
