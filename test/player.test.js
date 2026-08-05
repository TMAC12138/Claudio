import test from 'node:test';
import assert from 'node:assert/strict';
import * as player from '../public/js/player.js';

function createElement() {
  const attributes = new Map();
  return {
    textContent: '',
    innerHTML: '',
    disabled: false,
    title: '',
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) || null; },
  };
}

function installDom(ids) {
  const elements = new Map(ids.map(id => [id, createElement()]));
  global.document = {
    getElementById(id) { return elements.get(id) || null; },
  };
  return elements;
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('refreshes the pending queue without changing the current song and retains it on failure', async () => {
  const elements = installDom([
    'song-title',
    'song-artist',
    'song-album',
    'queue-preview',
    'queue-count',
    'queue-refresh-status',
    'btn-refresh-queue',
  ]);
  const button = elements.get('btn-refresh-queue');
  const current = { id: 'current', name: '当前歌曲', artist: '当前歌手' };
  player.playSong(current, { reason: '当前推荐' });

  global.fetch = async () => jsonResponse({
    play: [
      { id: 'next-1', name: '新队列一', artist: '歌手一' },
      { id: 'next-2', name: '新队列二', artist: '歌手二' },
    ],
  });

  await player.refreshQueue(button);

  assert.equal(player.getCurrentSong(), current);
  assert.equal(elements.get('queue-count').textContent, '队列 2 首');
  assert.match(elements.get('queue-preview').innerHTML, /新队列一/);
  assert.match(elements.get('queue-preview').innerHTML, /新队列二/);

  const previousPreview = elements.get('queue-preview').innerHTML;
  global.fetch = async () => jsonResponse({ error: '服务不可用' }, { ok: false, status: 502 });

  await player.refreshQueue(button);

  assert.equal(player.getCurrentSong(), current);
  assert.equal(elements.get('queue-count').textContent, '队列 2 首');
  assert.equal(elements.get('queue-preview').innerHTML, previousPreview);
  assert.match(elements.get('queue-refresh-status').textContent, /刷新失败：服务不可用/);
});

test('toggles the current favorite and ignores stale responses from the previous song', async () => {
  const elements = installDom([
    'song-title',
    'song-artist',
    'song-album',
    'btn-favorite',
    'favorite-status',
  ]);
  const favoriteButton = elements.get('btn-favorite');
  const songA = { id: 'a', name: '歌曲 A', artist: '歌手 A' };
  const songB = { id: 'b', name: '歌曲 B', artist: '歌手 B' };
  const songAPost = deferred();
  const songBGet = deferred();
  let songBPostMode = 'success';

  global.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.name === songA.name) return songAPost.promise;
      if (songBPostMode === 'failure') {
        return jsonResponse({ error: '磁盘不可写' }, { ok: false, status: 500 });
      }
      return jsonResponse({ ok: true, liked: body.liked });
    }

    const requestUrl = new URL(String(url), 'http://localhost');
    if (requestUrl.searchParams.get('name') === songB.name) return songBGet.promise;
    return jsonResponse({ liked: false });
  };

  player.playSong(songA);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(favoriteButton.getAttribute('aria-pressed'), 'false');

  const oldToggle = player.toggleFavorite();
  player.playSong(songB);
  songAPost.resolve(jsonResponse({ ok: true, liked: true }));
  await oldToggle;

  assert.equal(player.getCurrentSong(), songB);
  assert.notEqual(favoriteButton.getAttribute('aria-pressed'), 'true');

  songBGet.resolve(jsonResponse({ liked: false }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(favoriteButton.getAttribute('aria-pressed'), 'false');

  await player.toggleFavorite();
  assert.equal(favoriteButton.getAttribute('aria-pressed'), 'true');

  songBPostMode = 'failure';
  await player.toggleFavorite();
  assert.equal(favoriteButton.getAttribute('aria-pressed'), 'true');
  assert.match(elements.get('favorite-status').textContent, /更新失败：磁盘不可写/);
});
