const urlCache = new Map();
let baseUrl = 'http://localhost:3001';

export function configure(config) {
  baseUrl = config.baseUrl || baseUrl;
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
  return songs.map(s => ({
    id: String(s.id),
    name: s.name,
    artist: s.ar?.map(a => a.name).join('/') || '',
    album: s.al?.name || '',
    duration: s.dt || 0,
  }));
}

export async function getUrl(songId) {
  const cached = urlCache.get(songId);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, br: cached.br };
  }

  const data = await ncmFetch('/song_url', { id: String(songId) });
  const item = data?.data?.[0];
  if (!item?.url) return { url: null, error: 'No URL available' };

  const entry = { url: item.url, br: item.br || 320000, expiresAt: Date.now() + 9 * 60 * 1000 };
  urlCache.set(songId, entry);
  return { url: entry.url, br: entry.br };
}

export async function getLyric(songId) {
  const data = await ncmFetch('/lyric', { id: String(songId) });
  return { lrc: data?.lrc?.lyric || '', tlyric: data?.tlyric?.lyric || '' };
}

// Cleanup expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of urlCache) {
    if (val.expiresAt < now) urlCache.delete(key);
  }
}, 5 * 60 * 1000);
