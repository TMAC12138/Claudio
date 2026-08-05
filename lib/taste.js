const HEADING = '## 我喜欢的歌曲';

export function normalizeFavorite(song = {}) {
  const collapse = value => String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = collapse(song.name);
  if (!name) throw new Error('歌曲名不能为空');
  return { name, artist: collapse(song.artist) || '未知歌手' };
}

function favoriteLine(song) {
  const { name, artist } = normalizeFavorite(song);
  return `- 《${name}》 — ${artist}`;
}

function sectionBounds(content) {
  const lines = content.split('\n');
  const start = lines.findIndex(line => line.trim() === HEADING);
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { lines, start, end };
}

export function isFavorite(content, song) {
  const bounds = sectionBounds(String(content || ''));
  if (!bounds) return false;
  return bounds.lines.slice(bounds.start + 1, bounds.end).includes(favoriteLine(song));
}

export function setFavorite(content, song, liked) {
  const source = String(content || '');
  const line = favoriteLine(song);
  const bounds = sectionBounds(source);
  if (!bounds) {
    if (!liked) return source;
    return `${source.replace(/\n*$/, '')}\n\n${HEADING}\n\n${line}\n`;
  }

  const entries = bounds.lines
    .slice(bounds.start + 1, bounds.end)
    .filter(value => value && value !== line);
  if (liked) entries.push(line);

  const next = [
    ...bounds.lines.slice(0, bounds.start + 1),
    '',
    ...entries,
    ...bounds.lines.slice(bounds.end),
  ];
  return `${next.join('\n').replace(/\n*$/, '')}\n`;
}
