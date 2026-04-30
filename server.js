import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import * as db from './lib/db.js';
import * as router from './lib/router.js';
import * as context from './lib/context.js';
import * as claude from './lib/claude.js';
import * as ncm from './lib/ncm.js';

dotenv.config();

// Configure modules
ncm.configure({ baseUrl: process.env.NCM_BASE_URL });
claude.configure({ path: process.env.CLAUDE_PATH || 'claude' });

// Initialize
db.initDb();

const app = Fastify({ logger: true });

// CORS for PWA (M3)
app.addHook('onRequest', (req, reply, done) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return reply.send();
  done();
});

// POST /api/chat — main chat endpoint
app.post('/api/chat', async (req, reply) => {
  const { message } = req.body || {};
  if (!message) return reply.code(400).send({ error: 'message required' });

  db.saveMessage('user', message);
  const result = await router.route(message, db);

  if (result.type === 'play_direct') {
    try {
      const songs = await ncm.search(result.data.keyword);
      if (!songs.length) {
        const resp = { say: `没有找到 "${result.data.keyword}" 相关的歌曲`, play: [], reason: 'no_results' };
        db.saveMessage('assistant', resp.say);
        return resp;
      }
      const enriched = await Promise.all(songs.slice(0, 3).map(async s => {
        const { url } = await ncm.getUrl(s.id);
        return { ...s, url };
      }));
      db.saveMessage('assistant', `正在播放: ${enriched[0].name}`);
      db.recordPlay(enriched[0], 'chat');
      return { say: `好的，为你播放 ${enriched[0].name}`, play: enriched, reason: 'user_request' };
    } catch (err) {
      app.log.error(err);
      return { say: '音乐服务暂时不可用，请稍后再试', play: [], reason: 'ncm_error' };
    }
  }

  if (result.type === 'next') {
    const prompt = await context.assemble({ input: '请推荐下一首歌，用JSON格式回复', db });
    const aiResult = await claude.ask(prompt);
    db.saveMessage('assistant', aiResult.say);
    return aiResult;
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
  return aiResult;
});

// GET /api/now — current playback
app.get('/api/now', async () => {
  const plays = db.getRecentPlays(1);
  return plays[0] || { playing: false };
});

// GET /api/next — next recommendation
app.get('/api/next', async () => {
  const prompt = await context.assemble({ input: '推荐下一首歌', db });
  return claude.ask(prompt);
});

// GET /api/taste — user taste profile
app.get('/api/taste', async () => {
  const { readFileSync, existsSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = ['taste.md', 'routines.md', 'mood-rules.md'];
  const taste = {};
  for (const f of files) {
    const p = join(dir, 'user', f);
    taste[f.replace('.md', '')] = existsSync(p) ? readFileSync(p, 'utf-8') : '';
  }
  return taste;
});

// GET /api/plan/today — today's plan
app.get('/api/plan/today', async () => {
  return db.getTodayPlan();
});

// WS /stream — WebSocket stub (M2 will push events)
try {
  await app.register(fastifyWebsocket);
  app.get('/stream', { websocket: true }, (socket) => {
    const interval = setInterval(() => {
      if (socket.readyState === 1) socket.ping();
    }, 30000);
    socket.on('close', () => clearInterval(interval));
  });
} catch (err) {
  app.log.warn('WebSocket registration failed (non-fatal):', err.message);
}

// Start
const port = process.env.PORT || 3000;
try {
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`\n  Claudio is running at http://localhost:${port}\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
