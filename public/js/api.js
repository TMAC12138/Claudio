const API_BASE = '';
let ws = null;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function chat(message) {
  return fetchJson(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export async function getNow() {
  return fetchJson(`${API_BASE}/api/now`);
}

export async function getNext() {
  return fetchJson(`${API_BASE}/api/next`);
}

export async function refreshQueue() {
  return fetchJson(`${API_BASE}/api/queue/refresh`, { method: 'POST' });
}

export async function getLyric(id) {
  return fetchJson(`${API_BASE}/api/lyric/${encodeURIComponent(id)}`);
}

export async function skipCurrent() {
  return fetchJson(`${API_BASE}/api/play/skip-current`, { method: 'POST' });
}

export async function getTaste() {
  return fetchJson(`${API_BASE}/api/taste`);
}

export async function getScheduler() {
  return fetchJson(`${API_BASE}/api/scheduler`);
}

export async function getDevices() {
  return fetchJson(`${API_BASE}/api/devices`);
}

export async function getPrefs() {
  return fetchJson(`${API_BASE}/api/prefs`);
}

export async function setPref(key, value) {
  return fetchJson(`${API_BASE}/api/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
}

export async function getWeather() {
  return fetchJson(`${API_BASE}/api/weather`);
}

export async function getStats() {
  return fetchJson(`${API_BASE}/api/stats`);
}

export async function getTodayPlan() {
  return fetchJson(`${API_BASE}/api/plan/today`);
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
