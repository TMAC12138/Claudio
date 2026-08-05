import test from 'node:test';
import assert from 'node:assert/strict';
import { isFavorite, normalizeFavorite, setFavorite } from '../lib/taste.js';

test('adds a controlled favorite section without rewriting existing prose', () => {
  const original = '# taste\n比较偏向于流行曲风';
  const song = { name: '多远都要在一起', artist: 'G.E.M.邓紫棋' };
  const updated = setFavorite(original, song, true);

  assert.equal(updated, '# taste\n比较偏向于流行曲风\n\n## 我喜欢的歌曲\n\n- 《多远都要在一起》 — G.E.M.邓紫棋\n');
  assert.equal(isFavorite(updated, song), true);
});

test('adding the same normalized song twice is idempotent', () => {
  const song = { name: '  问爱  ', artist: ' yamy ' };
  const once = setFavorite('# taste\n', song, true);
  const twice = setFavorite(once, song, true);

  assert.equal(twice, once);
  assert.equal(twice.match(/《问爱》 — yamy/g)?.length, 1);
});

test('removes only the exact controlled favorite entry', () => {
  const original = '# taste\n手写内容《问爱》不能删除\n\n## 我喜欢的歌曲\n\n- 《问爱》 — yamy\n- 《晴天》 — 周杰伦\n';
  const updated = setFavorite(original, { name: '问爱', artist: 'yamy' }, false);

  assert.equal(updated.includes('手写内容《问爱》不能删除'), true);
  assert.equal(updated.includes('- 《问爱》 — yamy'), false);
  assert.equal(updated.includes('- 《晴天》 — 周杰伦'), true);
});

test('normalizes line breaks and preserves non-ASCII Markdown punctuation', () => {
  const song = normalizeFavorite({ name: ' 《回声》\n现场版 ', artist: ' 陈奕迅\r\nEason ' });
  assert.deepEqual(song, { name: '《回声》 现场版', artist: '陈奕迅 Eason' });

  const updated = setFavorite('# taste\n', song, true);
  assert.equal(isFavorite(updated, song), true);
  assert.equal(setFavorite(updated, song, false).includes('现场版'), false);
});

test('uses 未知歌手 and rejects a missing song name', () => {
  assert.deepEqual(normalizeFavorite({ name: '夜曲', artist: '' }), { name: '夜曲', artist: '未知歌手' });
  assert.throws(() => normalizeFavorite({ name: '  ' }), /歌曲名不能为空/);
});
