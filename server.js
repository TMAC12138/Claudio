import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { createReadStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as db from './lib/db.js';
import * as router from './lib/router.js';
import * as context from './lib/context.js';
import * as claude from './lib/claude.js';
import * as ncm from './lib/ncm.js';
import * as tts from './lib/tts.js';
import * as upnp from './lib/upnp.js';
import * as scheduler from './lib/scheduler.js';
import * as weather from './lib/weather.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configure modules
ncm.configure({ baseUrl: process.env.NCM_BASE_URL });
claude.configure({ path: process.env.CLAUDE_PATH || 'claude' });
tts.configure({ apiKey: process.env.FISH_API_KEY, voiceId: process.env.FISH_VOICE_ID });
weather.configure({ apiKey: process.env.WEATHER_API_KEY, city: process.env.WEATHER_CITY });

// Initialize
db.initDb();

const app = Fastify({ logger: true });

// Static file serving for PWA
await app.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/',
});

// CORS for PWA (M3)
app.addHook('onRequest', (req, reply, done) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return reply.send();
  done();
});

// Helper: add TTS to result
async function addTts(result) {
  if (result.say) {
    const ttsResult = await tts.synthesize(result.say);
    result.ttsUrl = ttsResult.url;
    if (ttsResult.error) app.log.warn('TTS error:', ttsResult.error);
  }
  return result;
}

// Static route for TTS files
app.get('/tts/:filename', async (req, reply) => {
  const filePath = join(__dirname, 'cache', 'tts', req.params.filename);
  if (!existsSync(filePath)) return reply.code(404).send({ error: 'not found' });
  return reply.type('audio/mpeg').send(createReadStream(filePath));
});

// POST /api/chat — main chat endpoint
app.post('/api/chat', async (req, reply) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') return reply.code(400).send({ error: 'message required' });
  if (message.length > 500) return reply.code(400).send({ error: 'message too long (max 500 chars)' });

  db.saveMessage('user', message);
  const result = await router.route(message, db);

  if (result.type === 'play_direct') {
    try {
      const songs = await ncm.search(result.data.keyword);
      if (!songs.length) {
        const resp = { say: `没有找到 "${result.data.keyword}" 相关的歌曲`, play: [], reason: 'no_results' };
        db.saveMessage('assistant', resp.say);
        return addTts(resp);
      }
      const enriched = await Promise.all(songs.slice(0, 3).map(async s => {
        const { url } = await ncm.getUrl(s.id);
        return { ...s, url };
      }));
      db.saveMessage('assistant', `正在播放: ${enriched[0].name}`);
      db.recordPlay(enriched[0], 'chat');
      return addTts({ say: `好的，为你播放 ${enriched[0].name}`, play: enriched, reason: 'user_request' });
    } catch (err) {
      app.log.error(err);
      return { say: '音乐服务暂时不可用，请稍后再试', play: [], reason: 'ncm_error' };
    }
  }

  if (result.type === 'next') {
    const prompt = await context.assemble({ input: '请推荐下一首歌，用JSON格式回复', db });
    const aiResult = await claude.ask(prompt);
    db.saveMessage('assistant', aiResult.say);
    return addTts(aiResult);
  }

  if (result.type === 'now') {
    const plays = db.getRecentPlays(1);
    const current = plays[0];
    if (!current) return { say: '目前还没有播放记录', play: [] };
    return { say: `正在播放: ${current.artist} - ${current.song_name}`, play: [current] };
  }

  // Claude path
  const prompt = await context.assemble({ input: result.data.input, db });
  const aiResult = await claude.ask(prompt);
  db.saveMessage('assistant', aiResult.say);
  if (aiResult.play?.length) {
    try {
      const first = aiResult.play[0];
      const keyword = `${first.name || first} ${first.artist || ''}`.trim();
      const songs = await ncm.search(keyword);
      if (songs.length) {
        const { url } = await ncm.getUrl(songs[0].id);
        aiResult.play = [{ ...songs[0], url }];
        db.recordPlay(songs[0], 'chat');
      }
    } catch {}
  }
  return addTts(aiResult);
});

// GET /api/now — current playback
app.get('/api/now', async () => {
  const plays = db.getRecentPlays(1);
  return plays[0] || { playing: false };
});

// GET /api/next — next recommendation
app.get('/api/next', async () => {
  const prompt = await context.assemble({ input: '推荐下一首歌', db });
  return addTts(await claude.ask(prompt));
});

// GET /api/taste — user taste profile
app.get('/api/taste', async () => {
  const { readFileSync } = await import('fs');
  const files = ['taste.md', 'routines.md', 'mood-rules.md'];
  const taste = {};
  for (const f of files) {
    const p = join(__dirname, 'user', f);
    taste[f.replace('.md', '')] = existsSync(p) ? readFileSync(p, 'utf-8') : '';
  }
  return taste;
});

// GET /api/plan/today — today's plan
app.get('/api/plan/today', async () => {
  return db.getTodayPlan();
});

// GET /api/devices — discover UPnP devices
app.get('/api/devices', async () => {
  const devices = await upnp.discover();
  return { devices, count: devices.length };
});

// POST /api/cast — push audio to speaker
app.post('/api/cast', async (req, reply) => {
  const { deviceUrl, url } = req.body || {};
  if (!deviceUrl || !url) return reply.code(400).send({ error: 'deviceUrl and url required' });
  if (typeof deviceUrl !== 'string' || typeof url !== 'string') return reply.code(400).send({ error: 'invalid parameters' });
  try {
    return await upnp.play(deviceUrl, url);
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

// POST /api/stop — stop playback on speaker
app.post('/api/stop', async (req, reply) => {
  const { deviceUrl } = req.body || {};
  if (!deviceUrl) return reply.code(400).send({ error: 'deviceUrl required' });
  try {
    return await upnp.stop(deviceUrl);
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

// GET /api/prefs — get all preferences
app.get('/api/prefs', async () => {
  const d = db.getDb();
  const rows = d.prepare('SELECT * FROM prefs').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
});

// POST /api/prefs — update preference
app.post('/api/prefs', async (req, reply) => {
  const { key, value } = req.body || {};
  if (!key || typeof key !== 'string') return reply.code(400).send({ error: 'key required' });
  if (key.length > 100) return reply.code(400).send({ error: 'key too long' });
  db.setPref(key, String(value ?? ''));
  return { ok: true };
});

// GET /api/weather — current weather
app.get('/api/weather', async () => weather.getWeather());

// POST /api/taste — update user taste file
app.post('/api/taste', async (req, reply) => {
  const { file, content } = req.body || {};
  if (!file || !content || typeof content !== 'string') return reply.code(400).send({ error: 'file and content required' });
  if (content.length > 5000) return reply.code(400).send({ error: 'content too long (max 5000 chars)' });
  const allowed = ['taste.md', 'routines.md', 'mood-rules.md'];
  if (!allowed.includes(file)) return reply.code(400).send({ error: 'invalid file name' });
  const { writeFileSync } = await import('fs');
  writeFileSync(join(__dirname, 'user', file), content, 'utf-8');
  return { ok: true };
});

// GET /api/stats — playback statistics
app.get('/api/stats', async () => {
  const d = db.getDb();
  const today = new Date().toISOString().slice(0, 10);
  const totalPlays = d.prepare("SELECT COUNT(*) as count FROM plays WHERE date(played_at) = ?").get(today)?.count || 0;
  const skipped = d.prepare("SELECT COUNT(*) as count FROM plays WHERE date(played_at) = ? AND skipped = 1").get(today)?.count || 0;
  const totalMessages = d.prepare("SELECT COUNT(*) as count FROM messages WHERE date(created_at) = ?").get(today)?.count || 0;
  const skipRate = totalPlays > 0 ? Math.round((skipped / totalPlays) * 100) : 0;
  return { totalPlays, skipped, skipRate, totalMessages };
});

// GET /api/scheduler — scheduler status
app.get('/api/scheduler', async () => scheduler.getStatus());

// WS /stream — WebSocket with broadcast
const clients = new Set();

try {
  await app.register(fastifyWebsocket);
  app.get('/stream', { websocket: true }, (socket) => {
    clients.add(socket);
    const interval = setInterval(() => {
      if (socket.readyState === 1) socket.ping();
    }, 30000);
    socket.on('close', () => {
      clearInterval(interval);
      clients.delete(socket);
    });
  });
} catch (err) {
  app.log.warn('WebSocket registration failed (non-fatal):', err.message);
}

// Wire scheduler broadcast to WebSocket
function wsBroadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}
scheduler.setBroadcast(wsBroadcast);
scheduler.start();

// Global error handler
app.setErrorHandler((err, req, reply) => {
  app.log.error(err);
  reply.code(500).send({ error: 'Internal server error' });
});

// Start
const port = process.env.PORT || 3000;
try {
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`\n  Claudio is running at http://localhost:${port}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
