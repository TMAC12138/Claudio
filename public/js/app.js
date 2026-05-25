import * as api from './api.js?v=20260518-3';
import * as player from './player.js?v=20260518-3';
import * as chat from './chat.js?v=20260518-3';

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

async function loadDashboardStats() {
  try {
    const stats = await api.getStats();
    const playsEl = document.getElementById('metric-plays');
    const messagesEl = document.getElementById('metric-messages');
    const skipEl = document.getElementById('metric-skip-rate');
    if (playsEl) playsEl.textContent = `${stats.totalPlays || 0} 首`;
    if (messagesEl) messagesEl.textContent = `${stats.totalMessages || 0} 次`;
    if (skipEl) skipEl.textContent = `${stats.skipRate || 0}%`;
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

async function stopService(kind) {
  const isClaudio = kind === 'claudio';
  const label = isClaudio ? 'Claudio' : 'NCM Enhanced';
  const ok = confirm(`确定要关闭 ${label} 服务吗？`);
  if (!ok) return;

  const statusEl = document.getElementById('service-status');
  if (statusEl) statusEl.textContent = `正在关闭 ${label}...`;

  const button = document.getElementById(isClaudio ? 'btn-stop-claudio' : 'btn-stop-ncm');
  if (button) button.disabled = true;

  try {
    const res = await fetch(isClaudio ? '/api/system/stop-claudio' : '/api/system/stop-ncm', {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '关闭失败');
    if (statusEl) statusEl.textContent = `${label} 已发送关闭请求。`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `${label} 关闭失败：${err.message}`;
    if (button) button.disabled = false;
  }
}

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
  document.querySelectorAll('.dock-jump').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
      if (view === 'profile') loadProfile();
      if (view === 'settings') loadSettings();
    });
  });

  document.getElementById('btn-play')?.addEventListener('click', () => player.togglePlay());
  document.getElementById('btn-next')?.addEventListener('click', (e) => {
    player.skipCurrent(e.currentTarget);
  });
  document.getElementById('btn-prev')?.addEventListener('click', () => player.playPrevious());
  document.getElementById('btn-chat-toggle')?.addEventListener('click', () => {
    showView('chat');
    chatInput?.focus();
  });
  document.getElementById('player-chat-send')?.addEventListener('click', () => sendPlayerMessage());
  document.getElementById('player-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendPlayerMessage();
    }
  });
  document.querySelectorAll('#mood-row button').forEach(button => {
    button.addEventListener('click', () => {
      chat.sendText(button.dataset.prompt);
    });
  });
  document.getElementById('btn-stop-ncm')?.addEventListener('click', () => stopService('ncm'));
  document.getElementById('btn-stop-claudio')?.addEventListener('click', () => stopService('claudio'));

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
      player.playSong({
        id: now.song_id,
        name: now.song_name,
        artist: now.artist,
        album: now.album,
      }, {
        say: '这是上次记录到的播放状态。点击继续或跳过当前，我会接着为你安排下一首。',
        reason: `来源：${now.source || 'history'}`,
      });
    }
  });

  api.getWeather().then(w => {
    const badge = document.getElementById('weather-badge');
    if (badge && !w.error) {
      badge.textContent = `${w.temp}°C ${w.description}`;
    }
  }).catch(() => {});

  loadDashboardStats();
  showView('player');
});

async function sendPlayerMessage() {
  const input = document.getElementById('player-chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  await chat.sendText(text);
}
