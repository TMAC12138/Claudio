import test from 'node:test';
import assert from 'node:assert/strict';
import * as ncm from '../lib/ncm.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('returns resolved songs and stops requesting after NCM rate limiting', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const warnings = [];

  ncm.configure({
    baseUrl: 'http://ncm.test',
    cookieFile: '/tmp/claudio-missing-ncm-cookie',
  });

  global.fetch = async input => {
    const url = new URL(input);
    calls.push(`${url.pathname}${url.search}`);

    if (url.pathname === '/search' && url.searchParams.get('keywords') === '歌曲 A 歌手 A') {
      return response({
        result: {
          songs: [{ id: 'partial-a', name: '歌曲 A', artists: [{ name: '歌手 A' }] }],
        },
      });
    }

    if (url.pathname === '/song/url/v1' && url.searchParams.get('id') === 'partial-a') {
      return response({ data: [{ id: 'partial-a', url: 'https://audio.test/partial-a.mp3' }] });
    }

    if (url.pathname === '/search' && url.searchParams.get('keywords') === '歌曲 B 歌手 B') {
      return response({ code: 405, message: '操作频繁，请稍候再试' }, 405);
    }

    throw new Error(`限流后仍发起请求: ${url.pathname}${url.search}`);
  };

  try {
    const songs = await ncm.resolvePlayableSongs([
      { name: '歌曲 A', artist: '歌手 A' },
      { name: '歌曲 B', artist: '歌手 B' },
      { name: '歌曲 C', artist: '歌手 C' },
    ], 3, {
      source: 'queue-refresh',
      logger: { warn: (...args) => warnings.push(args) },
    });

    assert.deepEqual(songs.map(song => song.id), ['partial-a']);
    assert.equal(calls.length, 3);
    assert.deepEqual(warnings[0][0], {
      event: 'ncm_rate_limited',
      upstreamStatus: 405,
      upstreamCode: 405,
      source: 'queue-refresh',
      resolvedCount: 1,
      requestCount: 3,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('reports HTTP 429 and stops when rate limiting happens before any song resolves', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  ncm.configure({
    baseUrl: 'http://ncm.test',
    cookieFile: '/tmp/claudio-missing-ncm-cookie',
  });

  global.fetch = async input => {
    const url = new URL(input);
    calls.push(`${url.pathname}${url.search}`);
    return response({ code: 405, message: '操作频繁，请稍候再试' }, 405);
  };

  try {
    await assert.rejects(
      () => ncm.resolvePlayableSongs([
        { name: '歌曲 D', artist: '歌手 D' },
        { name: '歌曲 E', artist: '歌手 E' },
      ], 2),
      error => {
        assert.equal(error.code, 'NCM_RATE_LIMITED');
        assert.equal(error.httpStatus, 429);
        assert.equal(error.resolvedCount, 0);
        assert.equal(error.requestCount, 1);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('searches the same related keyword only once per resolution round', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  ncm.configure({
    baseUrl: 'http://ncm.test',
    cookieFile: '/tmp/claudio-missing-ncm-cookie',
  });

  global.fetch = async input => {
    const url = new URL(input);
    calls.push(`${url.pathname}${url.search}`);
    const id = url.searchParams.get('id');

    if (url.pathname === '/search') {
      const keyword = url.searchParams.get('keywords');
      const songs = keyword === '相同歌手'
        ? [{ id: 'related-same', name: '相关歌曲一', artists: [{ name: '相同歌手' }] }]
        : [
            { id: 'related-other-1', name: '相关歌曲二', artists: [{ name: '其他歌手' }] },
            { id: 'related-other-2', name: '相关歌曲三', artists: [{ name: '其他歌手' }] },
          ];
      return response({ result: { songs } });
    }

    if (url.pathname === '/song/url/v1') {
      const isRelated = id?.startsWith('related-');
      return response({ data: [{ id, url: isRelated ? `https://audio.test/${id}.mp3` : null }] });
    }

    if (url.pathname === '/song_url') {
      return response({ data: [{ id, url: null }] });
    }

    throw new Error(`未预期的请求: ${url.pathname}${url.search}`);
  };

  try {
    const songs = await ncm.resolvePlayableSongs([
      { id: 'raw-1', name: '候选一', artist: '相同歌手' },
      { id: 'raw-2', name: '候选二', artist: '相同歌手' },
      { id: 'raw-3', name: '候选三', artist: '其他歌手' },
    ], 3);

    const repeatedSearches = calls.filter(call => call.includes('/search?keywords=%E7%9B%B8%E5%90%8C%E6%AD%8C%E6%89%8B&'));
    assert.equal(repeatedSearches.length, 1);
    assert.deepEqual(songs.map(song => song.id), [
      'related-same',
      'related-other-1',
      'related-other-2',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
