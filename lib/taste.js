import { randomUUID } from 'crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

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

  if (!liked && !entries.length) {
    const before = bounds.lines.slice(0, bounds.start);
    const after = bounds.lines.slice(bounds.end);
    while (before.at(-1) === '') before.pop();
    while (after[0] === '') after.shift();
    const remaining = after.length && before.length ? [...before, '', ...after] : [...before, ...after];
    return `${remaining.join('\n').replace(/\n*$/, '')}\n`;
  }

  const next = [
    ...bounds.lines.slice(0, bounds.start + 1),
    '',
    ...entries,
    ...bounds.lines.slice(bounds.end),
  ];
  return `${next.join('\n').replace(/\n*$/, '')}\n`;
}

export function readFavoriteFile(filePath, song) {
  return isFavorite(readFileSync(filePath, 'utf8'), song);
}

export function updateFavoriteFile(filePath, song, liked) {
  const current = readFileSync(filePath, 'utf8');
  const next = setFavorite(current, song, liked);
  if (next === current) return isFavorite(current, song);

  const tempPath = join(dirname(filePath), `.taste-${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, next, 'utf8');
    renameSync(tempPath, filePath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch {}
    throw error;
  }
  return isFavorite(next, song);
}
