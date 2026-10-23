/** open-meteo 预报接口封装：一次请求同时拿实况、逐日、逐小时，避免多次往返。 */
import { isRainyCode, isSnowyCode, weatherText, weekdayOf, windDirText } from "./wmo.js";

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  weatherDesc: string;
  windSpeed: number;
  windDirection: number;
  windDesc: string;
}

export interface DailyForecast {
  date: string;
  weekday: string;
  weatherCode: number;
  weatherDesc: string;
  tempMax: number;
  tempMin: number;
  precipProbability: number;
  windSpeedMax: number;
  sunrise?: string;
  sunset?: string;
}

export interface HourlyPoint {
  time: string;
  temperature: number;
  precipProbability: number;
}

export interface WeatherBundle {
  timezone: string;
  current: CurrentWeather;
  daily: DailyForecast[];
  hourly: HourlyPoint[];
}

interface RawForecast {
  timezone: string;
  current?: Record<string, number | string>;
  daily?: Record<string, (number | string | null)[]>;
  hourly?: Record<string, (number | string | null)[]>;
}

const CACHE = new Map<string, { at: number; data: WeatherBundle }>();
const TTL = 10 * 60 * 1000;

async function request(url: URL, retries = 1): Promise<RawForecast> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`天气接口返回 ${res.status}`);
      return (await res.json()) as RawForecast;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("天气接口请求失败");
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
  days: number,
): Promise<WeatherBundle> {
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)},${days}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset",
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(Math.min(Math.max(days, 1), 7)));

  const raw = await request(url);
  const cur = (raw.current ?? {}) as Record<string, number | string>;
  const d = raw.daily ?? {};
  const h = raw.hourly ?? {};

  const daily: DailyForecast[] = ((d.time as string[]) ?? []).map((date, i) => {
    const code = Number((d.weather_code as number[])?.[i] ?? -1);
    return {
      date,
      weekday: weekdayOf(date),
      weatherCode: code,
      weatherDesc: weatherText(code),
      tempMax: Number((d.temperature_2m_max as number[])?.[i] ?? 0),
      tempMin: Number((d.temperature_2m_min as number[])?.[i] ?? 0),
      precipProbability: Number((d.precipitation_probability_max as number[])?.[i] ?? 0),
      windSpeedMax: Number((d.wind_speed_10m_max as number[])?.[i] ?? 0),
      sunrise: (d.sunrise as string[])?.[i],
      sunset: (d.sunset as string[])?.[i],
    };
  });

  const hourly: HourlyPoint[] = ((h.time as string[]) ?? []).map((time, i) => ({
    time,
    temperature: Number((h.temperature_2m as number[])?.[i] ?? 0),
    precipProbability: Number((h.precipitation_probability as number[])?.[i] ?? 0),
  }));

  const bundle: WeatherBundle = {
    timezone: raw.timezone ?? "auto",
    current: {
      time: String(cur.time ?? ""),
      temperature: Number(cur.temperature_2m ?? 0),
      apparentTemperature: Number(cur.apparent_temperature ?? 0),
      humidity: Number(cur.relative_humidity_2m ?? 0),
      precipitation: Number(cur.precipitation ?? 0),
      weatherCode: Number(cur.weather_code ?? -1),
      weatherDesc: weatherText(Number(cur.weather_code ?? -1)),
      windSpeed: Number(cur.wind_speed_10m ?? 0),
      windDirection: Number(cur.wind_direction_10m ?? 0),
      windDesc: windDirText(Number(cur.wind_direction_10m ?? 0)),
    },
    daily,
    hourly,
  };

  CACHE.set(cacheKey, { at: Date.now(), data: bundle });
  return bundle;
}

export function summarizeCurrent(cityLabel: string, c: CurrentWeather): string {
  const bits = [
    `${cityLabel} 现在${c.weatherDesc}`,
    `${c.temperature.toFixed(0)}℃（体感 ${c.apparentTemperature.toFixed(0)}℃）`,
    `湿度 ${c.humidity}%`,
    `${c.windDesc} ${c.windSpeed.toFixed(0)} km/h`,
  ];
  if (c.precipitation > 0) bits.push(`正在降水 ${c.precipitation} mm`);
  return bits.join("，");
}

export function summarizeDaily(d: DailyForecast): string {
  return `${d.date} ${d.weekday} ${d.weatherDesc} ${d.tempMin.toFixed(0)}~${d.tempMax.toFixed(0)}℃ 降水概率 ${d.precipProbability}%`;
}

export function rainyOrSnowy(code: number): string | undefined {
  if (isRainyCode(code)) return "雨";
  if (isSnowyCode(code)) return "雪";
  return undefined;
}
