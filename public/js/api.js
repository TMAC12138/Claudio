const API_BASE = '';
let ws = null;

export async function chat(message) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

export async function getNow() {
  const res = await fetch(`${API_BASE}/api/now`);
  return res.json();
}

export async function getNext() {
  const res = await fetch(`${API_BASE}/api/next`);
  return res.json();
}

export async function getLyric(id) {
  const res = await fetch(`${API_BASE}/api/lyric/${encodeURIComponent(id)}`);
  return res.json();
}

export async function skipCurrent() {
  const res = await fetch(`${API_BASE}/api/play/skip-current`, { method: 'POST' });
  return res.json();
}

export async function getTaste() {
  const res = await fetch(`${API_BASE}/api/taste`);
  return res.json();
}

export async function getScheduler() {
  const res = await fetch(`${API_BASE}/api/scheduler`);
  return res.json();
}

export async function getDevices() {
  const res = await fetch(`${API_BASE}/api/devices`);
  return res.json();
}

export async function getPrefs() {
  const res = await fetch(`${API_BASE}/api/prefs`);
  return res.json();
}

export async function setPref(key, value) {
  const res = await fetch(`${API_BASE}/api/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  return res.json();
}

export async function getWeather() {
  const res = await fetch(`${API_BASE}/api/weather`);
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  return res.json();
}

export function connectWS(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/stream`);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {}
  };

  ws.onclose = () => {
    setTimeout(() => connectWS(onMessage), 3000);
  };

  return ws;
}

export function disconnectWS() {
  if (ws) { ws.close(); ws = null; }
}
