# Queue Refresh and Favorite Songs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a queue-only recommendation refresh and a reversible favorite-song heart that persists to `user/taste.md` without interrupting current playback.

**Architecture:** A focused `lib/taste.js` module owns normalization and atomic updates to a controlled Markdown section. Dedicated Fastify routes expose queue refresh and favorite state; the browser player owns queue replacement, preview rendering, request race protection, and heart-button state while preserving the current song.

**Tech Stack:** Node.js ESM, Fastify 5, browser-native JavaScript, HTML/CSS, Node built-in test runner, in-app Browser validation.

## Global Constraints

- Queue refresh must not change the current song, audio source, play/pause state, progress, or history stack.
- Refresh results replace the pending queue as a whole; every returned playable song is pending, including the first result.
- Queue refresh must not call `db.recordPlay()`.
- Favorite identity is the normalized `歌曲名 + 歌手`; missing artists become `未知歌手`.
- Only the controlled `## 我喜欢的歌曲` section may be changed; existing prose outside it must remain byte-for-byte unchanged except for the newline needed before an appended section.
- Do not add runtime or test dependencies.
- Preserve all unrelated uncommitted workspace changes and modify only lines required by this feature.

---

## File Map

- Create `lib/taste.js`: normalize favorite input, inspect and update controlled Markdown, and atomically update the file.
- Create `test/taste.test.js`: regression coverage for Markdown add/remove/idempotency and special characters.
- Create `test/player.test.js`: browser-player state coverage using small DOM and fetch fakes.
- Modify `package.json`: add the Node test command without changing existing scripts.
- Modify `server.js`: register queue-refresh and favorite-state routes; allow playable resolution without recording a play.
- Modify `public/js/api.js`: expose `refreshQueue()`, `getFavorite()`, and `setFavorite()`.
- Modify `public/js/player.js`: refresh the queue, render its preview, synchronize/toggle favorite state, and reject stale responses.
- Modify `public/js/app.js`: bind the queue-refresh and heart buttons.
- Modify `public/index.html`: add the controls and live status nodes.
- Modify `public/css/style.css`: style the controls across desktop and mobile layouts.

---

### Task 1: Favorite Markdown Domain Module

**Files:**
- Create: `lib/taste.js`
- Create: `test/taste.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeFavorite(song) -> { name: string, artist: string }`
- Produces: `isFavorite(content, song) -> boolean`
- Produces: `setFavorite(content, song, liked) -> string`
- Produces: `readFavoriteFile(filePath, song) -> boolean`
- Produces: `updateFavoriteFile(filePath, song, liked) -> boolean`

- [ ] **Step 1: Add the test command and write the failing Markdown tests**

Add `"test": "node --test"` to `package.json`, preserving all current scripts. Create `test/taste.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify RED**

Run: `rtk npm test -- test/taste.test.js`

Expected: FAIL because `../lib/taste.js` does not exist.

- [ ] **Step 3: Implement the minimal Markdown transformations and atomic file update**

Create `lib/taste.js` with constants for `## 我喜欢的歌曲` and list-entry formatting. Implement these rules exactly:

```js
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const HEADING = '## 我喜欢的歌曲';

export function normalizeFavorite(song = {}) {
  const collapse = value => String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const name = collapse(song.name);
  if (!name) throw new Error('歌曲名不能为空');
  return { name, artist: collapse(song.artist) || '未知歌手' };
}

function favoriteLine(song) {
  const { name, artist } = normalizeFavorite(song);
  return `- 《${name}》 — ${artist}`;
}

function sectionBounds(content) {
  const start = content.split('\n').findIndex(line => line.trim() === HEADING);
  if (start < 0) return null;
  const lines = content.split('\n');
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+/.test(lines[index])) { end = index; break; }
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

  const section = bounds.lines.slice(bounds.start + 1, bounds.end);
  const filtered = section.filter(value => value !== line);
  if (liked) filtered.push(line);
  const next = [...bounds.lines.slice(0, bounds.start + 1), ...filtered, ...bounds.lines.slice(bounds.end)];
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
```

Keep any formatting cleanup limited to the controlled section. If the exact implementation above needs a small correction to pass the specified tests, change only that transformation logic.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `rtk npm test -- test/taste.test.js`

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Commit the domain module**

```bash
rtk git add package.json lib/taste.js test/taste.test.js
rtk git commit -m "feat: manage favorite songs in taste profile"
```

Before staging, inspect `package.json` and stage only the intended test-script hunk because it already contains unrelated user modifications.

---

### Task 2: Dedicated Server APIs

**Files:**
- Modify: `server.js` near imports, `attachPlayableSongs`, `/api/next`, and `/api/taste`
- Test: `test/taste.test.js`

**Interfaces:**
- Consumes: `readFavoriteFile(filePath, song) -> boolean`
- Consumes: `updateFavoriteFile(filePath, song, liked) -> boolean`
- Produces: `POST /api/queue/refresh`
- Produces: `GET /api/taste/favorite?name=&artist=`
- Produces: `POST /api/taste/favorite` with `{ name, artist, liked }`

- [ ] **Step 1: Extend the file-helper test to verify real atomic persistence**

Append this test to `test/taste.test.js`:

```js
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFavoriteFile, updateFavoriteFile } from '../lib/taste.js';

test('atomically persists and removes a favorite in a real file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudio-taste-'));
  const file = join(dir, 'taste.md');
  writeFileSync(file, '# taste\n原始内容\n', 'utf8');

  assert.equal(updateFavoriteFile(file, { name: '晴天', artist: '周杰伦' }, true), true);
  assert.equal(readFavoriteFile(file, { name: '晴天', artist: '周杰伦' }), true);
  assert.equal(updateFavoriteFile(file, { name: '晴天', artist: '周杰伦' }, false), false);
  assert.equal(readFileSync(file, 'utf8').includes('原始内容'), true);
});
```

- [ ] **Step 2: Run the focused test to verify RED if file helpers are incomplete**

Run: `rtk npm test -- test/taste.test.js`

Expected: PASS if Task 1 implemented the file helpers exactly; otherwise FAIL on the missing persistence behavior. This is a contract verification gate before routing, not a substitute for the Task 1 RED run.

- [ ] **Step 3: Add server imports and favorite routes**

Import `readFavoriteFile` and `updateFavoriteFile`. Define `const tasteFilePath = join(__dirname, 'user', 'taste.md')` beside the other server constants. Add:

```js
app.get('/api/taste/favorite', async (req, reply) => {
  try {
    const { name, artist } = req.query || {};
    return { liked: readFavoriteFile(tasteFilePath, { name, artist }) };
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});

app.post('/api/taste/favorite', async (req, reply) => {
  try {
    const { name, artist, liked } = req.body || {};
    if (typeof liked !== 'boolean') return reply.code(400).send({ error: 'liked 必须是布尔值' });
    return { ok: true, liked: updateFavoriteFile(tasteFilePath, { name, artist }, liked) };
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
});
```

- [ ] **Step 4: Add queue refresh without playback recording**

Change `attachPlayableSongs` to accept `{ record = true } = {}` and guard its existing `db.recordPlay()` call with `record`. Add:

```js
app.post('/api/queue/refresh', async (req, reply) => {
  const prompt = await context.assemble({ input: '重新推荐下一批待播歌曲，不要改变当前歌曲', db });
  const result = await claude.ask(prompt);
  await attachPlayableSongs(result, 'queue-refresh', { record: false });
  if (!result.play.length) return reply.code(502).send({ error: '没有可播放的推荐歌曲' });
  return result;
});
```

Do not call `addTts()` or `db.saveMessage()` in this background refresh route.

- [ ] **Step 5: Run server-side verification**

Run:

```bash
rtk npm test -- test/taste.test.js
rtk node --check server.js
rtk node --check lib/taste.js
```

Expected: all tests pass and both syntax checks exit 0.

- [ ] **Step 6: Commit the API layer**

```bash
rtk git add server.js test/taste.test.js
rtk git commit -m "feat: add queue refresh and favorite APIs"
```

Stage only feature hunks in `server.js`; preserve its unrelated existing modifications.

---

### Task 3: Player Queue Refresh

**Files:**
- Create: `test/player.test.js`
- Modify: `public/js/api.js`
- Modify: `public/js/player.js`
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: `api.refreshQueue() -> Promise<RecommendationResult>`
- Produces: `player.refreshQueue(triggerButton) -> Promise<void>`
- Preserves: `player.getCurrentSong() -> Song | null`

- [ ] **Step 1: Write a failing queue-refresh player test**

Create `test/player.test.js` with a minimal fake DOM whose `getElementById()` returns mutable elements for `queue-preview`, `queue-count`, `queue-refresh-status`, `btn-refresh-queue`, song title/meta nodes, and no lyric box. Stub `global.fetch` to return a successful recommendation, call `player.playSong(current)`, then `await player.refreshQueue(button)`, and assert:

```js
assert.equal(player.getCurrentSong(), current);
assert.equal(elements.get('queue-count').textContent, '队列 2 首');
assert.match(elements.get('queue-preview').innerHTML, /新队列一/);
assert.match(elements.get('queue-preview').innerHTML, /新队列二/);
```

Then change `global.fetch` to return `{ ok: false, status: 502, json: async () => ({ error: '失败' }) }`, call refresh again, and assert the old preview HTML and queue count remain unchanged while `queue-refresh-status` contains `失败`.

- [ ] **Step 2: Run the player test to verify RED**

Run: `rtk npm test -- test/player.test.js`

Expected: FAIL because `player.refreshQueue` is not defined.

- [ ] **Step 3: Add the queue API and minimal player implementation**

In `public/js/api.js` add:

```js
export async function refreshQueue() {
  return fetchJson(`${API_BASE}/api/queue/refresh`, { method: 'POST' });
}
```

In `public/js/player.js` add a `refreshingQueue` boolean and implement `refreshQueue(triggerButton)`. Keep the old queue until the API returns a non-empty `play` array, then assign `queue = result.play.slice()` and render. Catch errors inside the function, keep the old queue, and set `queue-refresh-status` to `刷新失败：${error.message}`. Always restore button label, disabled state, and `refreshingQueue` in `finally`.

Implement `renderQueuePreview()` so it renders at most two escaped songs into `#queue-preview`, falls back to `等待生成下一批推荐` when empty, and is called from `updateQueueCount()`.

- [ ] **Step 4: Add and bind the queue control**

In `public/index.html`:

- Replace the static `prefetch 10` strong label with a compact `button#btn-refresh-queue` labeled `刷新推荐`.
- Add `small#queue-refresh-status` with `aria-live="polite"` in the same panel.
- Add `id="queue-preview"` to the existing preview container; initial placeholder content may remain until player initialization renders it.

In `public/js/app.js` bind:

```js
document.getElementById('btn-refresh-queue')?.addEventListener('click', event => {
  player.refreshQueue(event.currentTarget);
});
```

- [ ] **Step 5: Run the focused queue test to verify GREEN**

Run: `rtk npm test -- test/player.test.js`

Expected: queue refresh test passes, current song identity remains unchanged, and failure retains the rendered queue.

- [ ] **Step 6: Commit the queue UI behavior**

```bash
rtk git add test/player.test.js public/js/api.js public/js/player.js public/index.html public/js/app.js
rtk git commit -m "feat: refresh pending recommendation queue"
```

Stage only feature hunks in files that already contain unrelated user changes.

---

### Task 4: Favorite Heart State and Race Safety

**Files:**
- Modify: `test/player.test.js`
- Modify: `public/js/api.js`
- Modify: `public/js/player.js`
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: `api.getFavorite(song) -> Promise<{ liked: boolean }>`
- Produces: `api.setFavorite(song, liked) -> Promise<{ ok: boolean, liked: boolean }>`
- Produces: `player.toggleFavorite() -> Promise<void>`
- Internal invariant: only the newest request for the current `歌曲名 + 歌手` may render heart state.

- [ ] **Step 1: Extend the player test with favorite toggling and stale-response coverage**

Add mutable fake elements for `btn-favorite` and `favorite-status`. Make `global.fetch` inspect URL and method:

- GET favorite returns `{ liked: false }`.
- First POST captures its resolver instead of resolving immediately.
- Call `player.playSong(songA)`, then `player.toggleFavorite()`, then immediately call `player.playSong(songB)`.
- Resolve song A's POST with `{ ok: true, liked: true }`.
- Assert the button does not show song A as liked after song B is current.
- Resolve song B's GET with `{ liked: false }` and assert `aria-pressed` is `false`.
- Run a normal song B toggle and assert `aria-pressed` becomes `true` only after the POST succeeds.
- Make a later POST fail and assert the prior state and current song remain unchanged while `favorite-status` contains `更新失败`.

- [ ] **Step 2: Run the favorite test to verify RED**

Run: `rtk npm test -- test/player.test.js`

Expected: FAIL because `toggleFavorite` and favorite rendering are missing.

- [ ] **Step 3: Add favorite API calls**

In `public/js/api.js` add:

```js
export async function getFavorite(song) {
  const query = new URLSearchParams({ name: song.name || song.song_name || '', artist: song.artist || '' });
  return fetchJson(`${API_BASE}/api/taste/favorite?${query}`);
}

export async function setFavorite(song, liked) {
  return fetchJson(`${API_BASE}/api/taste/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: song.name || song.song_name, artist: song.artist, liked }),
  });
}
```

- [ ] **Step 4: Implement heart rendering, synchronization, toggling, and request tokens**

In `public/js/player.js` add `favoriteLiked`, `favoriteBusy`, and a monotonically increasing `favoriteRequestToken`.

- `playSong()` must call `syncFavoriteState(song)` after rendering the song.
- `syncFavoriteState(song)` increments the token, disables the button, clears stale status, queries the API, and only renders if both token and current song key still match.
- `toggleFavorite()` captures the current key and previous state, increments the token, disables the button, writes `!favoriteLiked`, and only applies the result if the token and current key still match.
- On failure, retain the previous `favoriteLiked`, show `更新失败：<message>`, and re-enable only if the same song is still current.
- `renderFavoriteButton()` writes `♡` or `♥`, `aria-pressed`, `title`, and `disabled` from the current state.

- [ ] **Step 5: Add and bind the heart control**

In `public/index.html`, wrap the song title and new button in `.song-title-row`:

```html
<div class="song-title-row">
  <h2 class="song-title" id="song-title">等待播放...</h2>
  <button id="btn-favorite" class="favorite-button" type="button" aria-label="喜欢这首歌" aria-pressed="false" disabled>♡</button>
</div>
<small id="favorite-status" class="interaction-status" aria-live="polite"></small>
```

In `public/js/app.js` bind `#btn-favorite` to `player.toggleFavorite()`.

- [ ] **Step 6: Run the player tests to verify GREEN**

Run: `rtk npm test -- test/player.test.js`

Expected: queue and favorite tests pass with no unhandled rejection.

- [ ] **Step 7: Commit favorite interaction behavior**

```bash
rtk git add test/player.test.js public/js/api.js public/js/player.js public/index.html public/js/app.js
rtk git commit -m "feat: toggle favorite songs from player"
```

Stage only feature hunks in files that already contain unrelated user changes.

---

### Task 5: Responsive Styling and Full Verification

**Files:**
- Modify: `public/css/style.css`
- Modify: `public/js/player.js` only if Browser QA finds a feature-specific defect
- Modify: `public/index.html` only if Browser QA finds a feature-specific accessibility defect

**Interfaces:**
- Consumes: existing IDs and classes from Tasks 3 and 4.
- Produces: clickable, non-overlapping queue and heart controls on desktop and mobile.

- [ ] **Step 1: Add minimal styles**

Add styles matching the existing visual language:

- `.song-title-row`: flex row, align start, gap, and `min-width: 0`.
- `.song-title`: retain existing typography and allow wrapping without pushing the heart outside the card.
- `.favorite-button`: 40px minimum hit target, transparent background, current pink accent for active state, visible focus ring, disabled opacity.
- `.queue-refresh-button`: compact pill matching existing mini controls, visible loading/disabled state, visible focus ring.
- `.interaction-status` and `.queue-refresh-status`: reserve a small line only when text exists; use existing muted and error colors.
- Mobile media rule: keep the heart beside the title without overlap and allow the queue header to wrap.

- [ ] **Step 2: Run the complete automated verification**

Run:

```bash
rtk npm test
rtk node --check server.js
rtk node --check lib/taste.js
rtk node --check public/js/api.js
rtk node --check public/js/player.js
rtk node --check public/js/app.js
rtk npm run health:check
rtk proxy git diff --check
```

Expected: all tests pass, all syntax checks exit 0, health check exits 0, and diff check reports no whitespace errors. If the health check requires the already-running local services, record any service-specific blocker exactly instead of hiding it.

- [ ] **Step 3: Validate the rendered target flows with the in-app Browser**

The queue flow under test is: `http://127.0.0.1:3000/` → play or restore a current song → click `刷新推荐` → current title/source/progress remain unchanged while queue count and preview change.

The favorite flow under test is: current song visible → click heart → heart becomes pressed and a controlled entry appears in `user/taste.md` → click again → heart becomes unpressed and only that controlled entry is removed.

Perform the required Browser checks:

- Confirm URL and title.
- Confirm meaningful DOM content and no framework error overlay.
- Inspect console warnings/errors.
- Capture desktop screenshot evidence.
- Exercise both target interactions and inspect the resulting DOM states.
- Repeat visual layout inspection at one mobile viewport.
- Restore the tested favorite to its original state before finishing.

- [ ] **Step 4: Re-run verification after any Browser-driven correction**

Run the full Step 2 command set again and repeat the affected Browser interaction. No completion claim is allowed from a stale test run.

- [ ] **Step 5: Commit the final styling and any feature-specific QA corrections**

```bash
rtk git add public/css/style.css
rtk git commit -m "style: polish queue and favorite controls"
```

If feature-specific corrections touched other files, stage only those hunks. Do not stage unrelated pre-existing changes.

---

## Final Review Checklist

- [ ] Every specification requirement maps to a task above.
- [ ] RED was observed before each production behavior was implemented.
- [ ] Existing uncommitted user changes remain present and uncommitted unless a directly overlapping feature hunk had to be committed.
- [ ] No new dependency or unrelated refactor was introduced.
- [ ] Queue refresh never records a play and never interrupts current audio.
- [ ] Favorite add/remove is idempotent and edits only the controlled Markdown section.
- [ ] Desktop and mobile rendered behavior have fresh screenshot and interaction evidence.
