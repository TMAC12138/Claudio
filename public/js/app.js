import * as api from './api.js';
import * as player from './player.js';
import * as chat from './chat.js';

let currentView = 'player';

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`)?.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${name}"]`)?.classList.add('active');

  currentView = name;
}

async function loadProfile() {
  try {
    const taste = await api.getTaste();
    const tasteEl = document.getElementById('taste-content');
    const routinesEl = document.getElementById('routines-content');
    const moodEl = document.getElementById('mood-content');
    if (tasteEl) tasteEl.textContent = taste.taste || '未设置';
    if (routinesEl) routinesEl.textContent = taste.routines || '未设置';
    if (moodEl) moodEl.textContent = taste['mood-rules'] || '未设置';
  } catch {}
}

window.editTaste = async (file) => {
  const el = file === 'taste.md' ? 'taste-content'
    : file === 'routines.md' ? 'routines-content'
    : 'mood-content';
  const current = document.getElementById(el)?.textContent || '';
  const newContent = prompt(`编辑 ${file}:`, current);
  if (newContent === null) return;

  await fetch('/api/taste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, content: newContent }),
  });
  loadProfile();
};

async function loadSettings() {
  try {
    const [scheduler, devices] = await Promise.all([
      api.getScheduler(),
      api.getDevices(),
    ]);

    const schedEl = document.getElementById('scheduler-status');
    if (schedEl) {
      schedEl.innerHTML = scheduler.slots.map(s =>
        `<div class="setting-row"><span>${s}</span><span class="badge">✓</span></div>`
      ).join('');
    }

    const devEl = document.getElementById('devices-list');
    if (devEl) {
      if (devices.count === 0) {
        devEl.innerHTML = '<div class="setting-row">未发现设备</div>';
      } else {
        devEl.innerHTML = devices.devices.map(d =>
          `<div class="setting-row"><span>${d.name}</span><button class="btn-small" onclick="castToDevice('${d.location}')">推送</button></div>`
        ).join('');
      }
    }

    const stats = await api.getStats();
    const statsEl = document.getElementById('stats-content');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="setting-row"><span>播放次数</span><span>${stats.totalPlays} 首</span></div>
        <div class="setting-row"><span>跳过次数</span><span>${stats.skipped} 次</span></div>
        <div class="setting-row"><span>跳过率</span><span>${stats.skipRate}%</span></div>
        <div class="setting-row"><span>对话次数</span><span>${stats.totalMessages} 次</span></div>
      `;
    }
  } catch {}
}

window.castToDevice = async (deviceUrl) => {
  const song = player.getCurrentSong();
  if (!song?.url) return alert('请先播放一首歌');
  await fetch('/api/cast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceUrl, url: song.url }),
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const audioEl = document.getElementById('audio');
  if (audioEl) player.init(audioEl);

  const messagesEl = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  if (messagesEl && chatInput) chat.init(messagesEl, chatInput);

  document.getElementById('chat-send')?.addEventListener('click', () => chat.sendMessage());

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
      if (view === 'profile') loadProfile();
      if (view === 'settings') loadSettings();
    });
  });

  document.getElementById('btn-play')?.addEventListener('click', () => player.togglePlay());
  document.getElementById('btn-next')?.addEventListener('click', async () => {
    const result = await api.getNext();
    if (result.play?.length) player.playSong(result.play[0]);
  });

  document.getElementById('progress-container')?.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    player.seek((e.clientX - rect.left) / rect.width);
  });

  document.getElementById('volume')?.addEventListener('input', (e) => {
    player.setVolume(e.target.value / 100);
  });

  api.connectWS((data) => {
    if (data.type === 'auto-broadcast') {
      chat.handleBroadcast(data);
    }
  });

  api.getNow().then(now => {
    if (now.song_name) {
      document.getElementById('song-title').textContent = now.song_name;
      document.getElementById('song-artist').textContent = now.artist || '';
    }
  });

  api.getWeather().then(w => {
    const badge = document.getElementById('weather-badge');
    if (badge && !w.error) {
      badge.textContent = `${w.temp}°C ${w.description}`;
    }
  }).catch(() => {});

  showView('player');
});
