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
