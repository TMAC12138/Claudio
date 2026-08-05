import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPlayableSongs } from '../lib/recommendation.js';

test('resolves a refreshed queue without recording an unplayed song', async () => {
  const recorded = [];
  const result = { play: [{ name: '候选歌曲' }] };
  const dependencies = {
    ncm: { resolvePlayableSongs: async () => [{ id: '1', name: '候选歌曲' }] },
    db: { recordPlay: (...args) => recorded.push(args) },
    logger: { warn() {} },
  };

  await attachPlayableSongs(result, 'queue-refresh', dependencies, { record: false });

  assert.deepEqual(result.play, [{ id: '1', name: '候选歌曲' }]);
  assert.deepEqual(recorded, []);
});

test('keeps recording the first playable song for normal playback requests', async () => {
  const recorded = [];
  const result = { play: [{ name: '当前歌曲' }] };
  const dependencies = {
    ncm: { resolvePlayableSongs: async () => [{ id: '2', name: '当前歌曲' }] },
    db: { recordPlay: (...args) => recorded.push(args) },
    logger: { warn() {} },
  };

  await attachPlayableSongs(result, 'next', dependencies);

  assert.deepEqual(recorded, [[{ id: '2', name: '当前歌曲' }, 'next']]);
});

test('returns an empty playable list when music resolution fails', async () => {
  const warnings = [];
  const result = { play: [{ name: '无法解析' }] };
  const dependencies = {
    ncm: { resolvePlayableSongs: async () => { throw new Error('NCM unavailable'); } },
    db: { recordPlay() {} },
    logger: { warn: (...args) => warnings.push(args) },
  };

  await attachPlayableSongs(result, 'next', dependencies);

  assert.deepEqual(result.play, []);
  assert.equal(warnings[0][0], 'Music URL resolve error:');
  assert.equal(warnings[0][1], 'NCM unavailable');
});
