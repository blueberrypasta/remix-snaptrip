import type { LocationData } from '../types';

export interface NearbyWeather {
  emoji: string;
  tempC: number;
  observedAt: string;
}

// Attribution: Open-Meteo API (CC BY 4.0). Data is model-derived, not physical sensor observation.
const WEATHER_CODES = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

let cacheEntry: { gridKey: string; data: NearbyWeather; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getGridKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export function weatherEmoji(code: number, day: boolean): string {
  switch (code) {
    case 0: return day ? '☀️' : '🌙';
    case 1: return day ? '🌤️' : '🌙';
    case 2: return '⛅';
    case 3: return '☁️';
    case 45: case 48: return '🌫️';
    case 51: case 53: case 55: return '🌦️';
    case 56: case 57: case 66: case 67: return '🌧️';
    case 61: case 63: case 65: case 80: case 81: case 82: return '🌧️';
    case 71: case 73: case 75: case 77: case 85: case 86: return '❄️';
    case 95: case 96: case 99: return '⛈️';
    default: return '❓';
  }
}

export function parseCurrentWeather(data: unknown): NearbyWeather {
  if (!data || typeof data !== 'object') throw new Error('weather_unavailable');
  
  const obj = data as { current?: Record<string, unknown>; current_units?: Record<string, unknown> };
  if (!obj.current || !obj.current_units) throw new Error('weather_unavailable');

  const current = obj.current;
  const units = obj.current_units;

  // Validate temperature
  const tempRaw = current.temperature_2m;
  if (typeof tempRaw !== 'number' || !isFinite(tempRaw)) throw new Error('weather_unavailable');
  if (tempRaw < -100 || tempRaw > 70) throw new Error('weather_unavailable');
  
  // Validate unit is exactly °C
  if (units.temperature_2m !== '°C') throw new Error('weather_unavailable');

  // Validate time format
  const timeStr = current.time;
  if (typeof timeStr !== 'string' || !ISO_REGEX.test(timeStr)) throw new Error('weather_unavailable');

  // Validate weather code
  const codeRaw = current.weather_code;
  if (typeof codeRaw !== 'number' || !Number.isInteger(codeRaw) || !WEATHER_CODES.has(codeRaw)) {
    throw new Error('weather_unavailable');
  }

  if (current.is_day !== 0 && current.is_day !== 1) throw new Error('weather_unavailable');
  const isDay = current.is_day === 1;

  const emoji = weatherEmoji(codeRaw, isDay);

  return {
    emoji,
    tempC: tempRaw,
    observedAt: timeStr
  };
}

export async function fetchCurrentWeather(location: LocationData, signal?: AbortSignal): Promise<NearbyWeather> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const {latitude: lat, longitude: lon} = location;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error('weather_unavailable');
  }
  const gridKey = getGridKey(lat, lon);
  if (cacheEntry?.gridKey === gridKey && Date.now() - cacheEntry.fetchedAt < CACHE_TTL_MS) return cacheEntry.data;
  const params = new URLSearchParams({latitude: lat.toFixed(2), longitude: lon.toFixed(2), current: 'temperature_2m,weather_code,is_day', timezone: 'auto', forecast_days: '1'});
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, {once: true});
  const timeoutId = setTimeout(onAbort, 8000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {signal: controller.signal});
    if (!response.ok) throw new Error('weather_unavailable');
    const data: unknown = await response.json();
    if (controller.signal.aborted || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const weather = parseCurrentWeather(data);
    cacheEntry = {gridKey, data: weather, fetchedAt: Date.now()};
    return weather;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('weather_unavailable', {cause: error});
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}
