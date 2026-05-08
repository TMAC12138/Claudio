let apiKey = '';
let city = 'Beijing';
let cached = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function configure(config) {
  apiKey = config.apiKey || apiKey;
  city = config.city || city;
}

export async function getWeather() {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_TTL) return cached;

  if (!apiKey) return { error: 'WEATHER_API_KEY not configured' };

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`;
    const res = await fetch(url);
    if (!res.ok) return { error: `Weather API ${res.status}` };

    const data = await res.json();
    cached = {
      city: data.name,
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      description: data.weather[0]?.description || '',
      icon: data.weather[0]?.icon || '',
      humidity: data.main.humidity,
      wind: Math.round(data.wind.speed),
    };
    cacheTime = now;
    return cached;
  } catch (err) {
    return { error: err.message };
  }
}

export function getCachedWeather() {
  return cached;
}
