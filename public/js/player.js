let audio = null;
let currentSong = null;

export function init(audioElement) {
  audio = audioElement;

  audio.addEventListener('ended', () => {
    import('./api.js').then(api => {
      api.getNext().then(result => {
        if (result.play?.length) playSong(result.play[0]);
      });
    });
  });

  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateDuration);
}

export function playSong(song) {
  if (!audio || !song?.url) return;
  currentSong = song;
  audio.src = song.url;
  audio.play();

  document.getElementById('song-title').textContent = song.name || 'Unknown';
  document.getElementById('song-artist').textContent = song.artist || '';

  const cover = document.getElementById('album-cover');
  if (cover) cover.classList.add('playing');
}

export function togglePlay() {
  if (!audio) return;

  // If no song loaded, request next recommendation
  if (!audio.src || audio.src === location.href) {
    import('./api.js').then(api => {
      api.getNext().then(result => {
        if (result.play?.length) playSong(result.play[0]);
      });
    });
    return;
  }

  if (audio.paused) {
    audio.play();
    document.getElementById('album-cover')?.classList.add('playing');
  } else {
    audio.pause();
    document.getElementById('album-cover')?.classList.remove('playing');
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

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function getCurrentSong() {
  return currentSong;
}
