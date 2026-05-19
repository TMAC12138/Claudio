let audio = null;
let currentSong = null;
let loadingNext = false;

export function init(audioElement) {
  audio = audioElement;

  audio.addEventListener('ended', () => {
    setPlayingState(false);
    updateProgress();
    requestNextSong();
  });

  audio.addEventListener('play', () => setPlayingState(true));
  audio.addEventListener('pause', () => setPlayingState(false));
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateDuration);
  audio.addEventListener('error', () => setPlayingState(false));
}

export function playSong(song) {
  if (!audio || !song?.url) return;
  currentSong = song;
  audio.src = song.url;
  audio.play().catch(() => setPlayingState(false));

  document.getElementById('song-title').textContent = song.name || 'Unknown';
  document.getElementById('song-artist').textContent = song.artist || '';
}

export function togglePlay() {
  if (!audio) return;

  // If no song loaded, request next recommendation
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

export function seek(fraction) {
  if (!audio || !audio.duration) return;
  audio.currentTime = fraction * audio.duration;
}

export function setVolume(v) {
  if (audio) audio.volume = Math.max(0, Math.min(1, v));
}

function updateProgress() {
  const bar = document.getElementById('progress-bar');
  const timeEl = document.getElementById('time-current');
  if (!bar || !audio?.duration) return;

  const pct = (audio.currentTime / audio.duration) * 100;
  bar.style.width = `${pct}%`;
  if (timeEl) timeEl.textContent = formatTime(audio.currentTime);
}

function updateDuration() {
  const durEl = document.getElementById('time-duration');
  if (durEl && audio?.duration) durEl.textContent = formatTime(audio.duration);
}

function setPlayingState(isPlaying) {
  document.getElementById('album-cover')?.classList.toggle('playing', isPlaying);
  const btn = document.getElementById('btn-play');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

export async function requestNextSong(triggerButton) {
  if (loadingNext) return;
  loadingNext = true;
  setLoadingState(true, triggerButton);

  try {
    const api = await import('./api.js?v=20260518-2');
    const result = await api.getNext();
    if (result.play?.length) playSong(result.play[0]);
  } finally {
    loadingNext = false;
    setLoadingState(false, triggerButton);
  }
}

function setLoadingState(isLoading, triggerButton) {
  const btn = document.getElementById('btn-play');
  if (btn) {
    btn.textContent = isLoading ? '…' : (audio && !audio.paused ? '⏸' : '▶');
    btn.disabled = isLoading;
  }
  if (triggerButton && triggerButton !== btn) {
    triggerButton.textContent = isLoading ? '…' : '⏭';
    triggerButton.disabled = isLoading;
  }
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function getCurrentSong() {
  return currentSong;
}
