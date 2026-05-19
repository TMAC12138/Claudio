import * as api from './api.js?v=20260518-2';
import { playSong } from './player.js?v=20260518-2';

let messagesEl = null;
let inputEl = null;
let ttsEnabled = true;
let ttsAudio = null;

export function init(container, input) {
  messagesEl = container;
  inputEl = input;

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

export async function sendMessage() {
  const text = inputEl?.value?.trim();
  if (!text) return;
  inputEl.value = '';

  addMessage('user', text);

  try {
    const result = await api.chat(text);
    addMessage('dj', result.say, result);

    if (result.ttsUrl && ttsEnabled) {
      playTTS(result.ttsUrl);
    }

    if (result.play?.length) {
      playSong(result.play[0]);
    }
  } catch (err) {
    addMessage('dj', '抱歉，出了点问题，请稍后再试。');
  }
}

export function handleBroadcast(data) {
  addMessage('dj', data.say, data);

  if (data.ttsUrl && ttsEnabled) {
    playTTS(data.ttsUrl);
  }

  if (data.play?.length) {
    playSong(data.play[0]);
  }
}

function addMessage(role, text, result) {
  if (!messagesEl) return;

  const div = document.createElement('div');
  div.className = `msg msg-${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);

  if (result?.play?.length) {
    const btn = document.createElement('button');
    btn.className = 'msg-play-btn';
    btn.textContent = `▶ ${result.play[0].name}`;
    btn.onclick = () => playSong(result.play[0]);
    div.appendChild(btn);
  }

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function playTTS(url) {
  if (ttsAudio) ttsAudio.pause();
  ttsAudio = new Audio(url);
  ttsAudio.volume = 0.8;
  ttsAudio.play().catch(() => {});
}

export function setTtsEnabled(enabled) {
  ttsEnabled = enabled;
}
