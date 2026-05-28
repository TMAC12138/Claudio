let audio = null;
let currentSong = null;
let currentMeta = null;
let loadingNext = false;
let queue = [];
let history = [];
let lyricLines = [];
let lyricsAutoScroll = true;

export function init(audioElement) {
  audio = audioElement;
  initLyricsToggle();

  audio.addEventListener('ended', () => {
    setPlayingState(false);
    updateProgress();
    playNextFromQueue();
  });

  audio.addEventListener('play', () => setPlayingState(true));
  audio.addEventListener('pause', () => setPlayingState(false));
  audio.addEventListener('timeupdate', () => {
    updateProgress();
    syncLyric();
  });
  audio.addEventListener('loadedmetadata', updateDuration);
  audio.addEventListener('error', () => setPlayingState(false));

  updateQueueCount();
}

function initLyricsToggle() {
  const button = document.getElementById('btn-lyrics-autoscroll');
  if (!button) return;
  button.addEventListener('click', () => {
    lyricsAutoScroll = !lyricsAutoScroll;
    renderLyricsToggle();
  });
  renderLyricsToggle();
}

function renderLyricsToggle() {
  const button = document.getElementById('btn-lyrics-autoscroll');
  if (!button) return;
  button.classList.toggle('is-on', lyricsAutoScroll);
  button.setAttribute('aria-pressed', String(lyricsAutoScroll));
  button.textContent = lyricsAutoScroll ? '自动滚动 开' : '自动滚动 关';
}

function setLyricsExpanded(expanded) {
  const box = document.getElementById('lyrics-content');
  box?.closest('.cover-lyrics')?.classList.toggle('has-lines', expanded);
}

export function playResult(result) {
  if (result?.play?.length) {
    queue = result.play.slice(1);
    prefetchAudio(result.play);
    playSong(result.play[0], result);
  } else {
    updateRecommendationText(result);
  }
  updateQueueCount();
}

function prefetchAudio(songs) {
  const urls = songs.map(song => song.url).filter(Boolean).slice(0, 10);
  if (!urls.length || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'prefetch-audio', urls });
}

export function playSong(song, meta = currentMeta) {
  if (!song) return;
  if (currentSong?.url && song.url && currentSong.url !== song.url) history.push(currentSong);

  currentSong = song;
  currentMeta = meta || {};
  if (audio && song.url) {
    audio.src = song.url;
    audio.play().catch(() => setPlayingState(false));
  }

  renderSong(song);
  updateRecommendationText(currentMeta);
  loadLyrics(song.id || song.song_id);
}

export function togglePlay() {
  if (!audio) return;

  if (!audio.src || audio.src === location.href) {
    requestNextSong(document.getElementById('btn-play'));
    return;
  }

  if (audio.paused) {
    if (audio.ended) audio.currentTime = 0;
    audio.play().catch(() => setPlayingState(false));
  } else {
    audio.pause();
  }
}

export function playPrevious() {
  const previous = history.pop();
  if (!previous) return;
  if (currentSong) queue.unshift(currentSong);
  playSong(previous, currentMeta);
  updateQueueCount();
}

export async function skipCurrent(triggerButton) {
  try {
    const api = await import('./api.js?v=20260518-3');
    await api.skipCurrent();
  } catch {}
  playNextFromQueue(triggerButton);
}

export function seek(fraction) {
  if (!audio || !audio.duration) return;
  audio.currentTime = fraction * audio.duration;
}

export function setVolume(v) {
  if (audio) audio.volume = Math.max(0, Math.min(1, v));
}

export async function requestNextSong(triggerButton) {
  if (loadingNext) return;
  loadingNext = true;
  setLoadingState(true, triggerButton);

  try {
    const api = await import('./api.js?v=20260518-3');
    const result = await api.getNext();
    playResult(result);
  } finally {
    loadingNext = false;
    setLoadingState(false, triggerButton);
  }
}

function playNextFromQueue(triggerButton) {
  const next = queue.shift();
  if (next) {
    playSong(next, currentMeta);
    updateQueueCount();
    return;
  }
  requestNextSong(triggerButton || document.getElementById('btn-next'));
}

function renderSong(song) {
  setText('song-title', song.name || song.song_name || 'Unknown');
  setText('song-artist', song.artist || '未知歌手');
  setText('song-album', song.album || '未知专辑');

  const cover = document.getElementById('album-cover-img');
  const fallback = document.getElementById('album-cover');
  if (cover && fallback) {
    if (song.cover) {
      cover.classList.remove('visible');
      cover.src = song.cover;
      cover.onload = () => cover.classList.add('visible');
      cover.onerror = () => {
        cover.removeAttribute('src');
        cover.classList.remove('visible');
      };
    } else {
      cover.removeAttribute('src');
      cover.classList.remove('visible');
    }
  }
}

function updateRecommendationText(meta) {
  if (!meta) return;
  if (meta.say) setText('dj-line', meta.say);
  if (meta.reason) setText('reason-line', `选曲理由：${meta.reason}`);

  const tags = buildTags(meta);
  const row = document.getElementById('reason-tags');
  if (row && tags.length) {
    row.innerHTML = tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
  }
}

function buildTags(meta) {
  const text = `${meta.reason || ''} ${meta.segue || ''} ${meta.say || ''}`;
  const seeds = ['温暖', '午后', '平静', '专注', '放松', '深夜', '通勤', '工作', '清醒', '疗愈', '轻快', '安静'];
  const found = seeds.filter(seed => text.includes(seed));
  return (found.length ? found : ['私人推荐', '此刻', 'Claudio']).slice(0, 4);
}

async function loadLyrics(songId) {
  lyricLines = [];
  const box = document.getElementById('lyrics-content');
  if (!box) return;
  setLyricsExpanded(false);
  if (!songId) {
    box.textContent = '这首歌暂时没有歌词信息。';
    return;
  }

  box.textContent = '正在加载歌词...';
  try {
    const api = await import('./api.js?v=20260518-3');
    const data = await api.getLyric(songId);
    lyricLines = parseLrc(data.lrc || data.tlyric || '');
    if (!lyricLines.length) {
      box.textContent = '这首歌暂时没有歌词信息。';
      return;
    }
    box.innerHTML = lyricLines.map((line, index) =>
      `<p data-index="${index}">${escapeHtml(line.text)}</p>`
    ).join('');
    setLyricsExpanded(true);
  } catch {
    box.textContent = '歌词加载失败。';
  }
}

function parseLrc(lrc) {
  return lrc.split('\n')
    .map(line => {
      const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
      if (!match) return null;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] || '0').padEnd(3, '0'));
      const text = match[4].trim();
      if (!text) return null;
      return { time: minutes * 60 + seconds + fraction / 1000, text };
    })
    .filter(Boolean);
}

function syncLyric() {
  if (!audio || !lyricLines.length) return;
  let active = 0;
  for (let i = 0; i < lyricLines.length; i += 1) {
    if (lyricLines[i].time <= audio.currentTime) active = i;
    else break;
  }

  const box = document.getElementById('lyrics-content');
  const current = box?.querySelector(`[data-index="${active}"]`);
  if (!current || current.classList.contains('active')) return;
  box.querySelectorAll('p').forEach(p => p.classList.remove('active'));
  current.classList.add('active');
  if (lyricsAutoScroll) {
    current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function updateProgress() {
  const bar = document.getElementById('progress-bar');
  const timeEl = document.getElementById('time-current');
  if (!bar || !audio?.duration) return;

  const pct = (audio.currentTime / audio.duration) * 100;
  bar.style.width = `${pct}%`;
  bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(pct)));
  if (timeEl) timeEl.textContent = formatTime(audio.currentTime);
}

function updateDuration() {
  const durEl = document.getElementById('time-duration');
  if (durEl && audio?.duration) durEl.textContent = formatTime(audio.duration);
}

function setPlayingState(isPlaying) {
  document.getElementById('album-cover')?.classList.toggle('playing', isPlaying);
  document.getElementById('album-cover-img')?.classList.toggle('playing', isPlaying);
  setText('play-status', isPlaying ? '正在播放' : '暂停中');

  const btn = document.getElementById('btn-play');
  if (btn) btn.textContent = isPlaying ? '暂停' : '继续';
}

function setLoadingState(isLoading, triggerButton) {
  const btn = document.getElementById('btn-play');
  if (btn) {
    btn.textContent = isLoading ? '挑歌中...' : (audio && !audio.paused ? '暂停' : '继续');
    btn.disabled = isLoading;
  }
  if (triggerButton && triggerButton !== btn) {
    triggerButton.textContent = isLoading ? '…' : getActionButtonLabel(triggerButton);
    triggerButton.title = isLoading ? '挑歌中...' : (triggerButton.getAttribute('aria-label') || triggerButton.title);
    triggerButton.disabled = isLoading;
  }
}

function getActionButtonLabel(button) {
  if (button.id === 'btn-next') return '›';
  if (button.id === 'btn-prev') return '‹';
  return button.dataset.label || button.textContent || '';
}

function updateQueueCount() {
  setText('queue-count', `队列 ${queue.length} 首`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function getCurrentSong() {
  return currentSong;
}
