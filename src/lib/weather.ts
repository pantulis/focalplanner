// Weather forecast via Open-Meteo (https://open-meteo.com) — a free, keyless,
// CORS-enabled API, so the webview fetches it directly (no Rust command needed).
// Data is licensed CC-BY 4.0; the Settings panel carries the attribution.
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type WeatherUnit = "celsius" | "fahrenheit";

export interface WeatherDay {
  date: string; // YYYY-MM-DD (local)
  code: number; // WMO weather code
  tempMax: number;
  tempMin: number;
  precipProb: number; // %
}

export interface GeoMatch {
  lat: number;
  lon: number;
  label: string; // e.g. "Madrid, Madrid, Spain"
}

/** Resolve a free-text city query to coordinate candidates (best match first). */
export async function geocodeCity(query: string): Promise<GeoMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(q) +
    "&count=5&language=en&format=json";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`geocoding failed: ${resp.status}`);
  const data = (await resp.json()) as {
    results?: Array<{
      latitude: number;
      longitude: number;
      name: string;
      admin1?: string;
      country?: string;
    }>;
  };
  return (data.results ?? []).map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
  }));
}

/** Fetch the daily forecast (~16 days) keyed by local YYYY-MM-DD. */
export async function fetchForecast(
  lat: number,
  lon: number,
  unit: WeatherUnit,
): Promise<Map<string, WeatherDay>> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" +
    lat +
    "&longitude=" +
    lon +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=auto&forecast_days=16&temperature_unit=" +
    unit;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`forecast failed: ${resp.status}`);
  const data = (await resp.json()) as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
    };
  };
  const out = new Map<string, WeatherDay>();
  const d = data.daily;
  if (!d) return out;
  for (let i = 0; i < d.time.length; i++) {
    out.set(d.time[i], {
      date: d.time[i],
      code: d.weather_code[i],
      tempMax: d.temperature_2m_max[i],
      tempMin: d.temperature_2m_min[i],
      precipProb: d.precipitation_probability_max[i] ?? 0,
    });
  }
  return out;
}

/** WMO weather code → lucide icon (matching the app's icon style). */
export function weatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

/** WMO weather code → short human label (for the header tooltip). */
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}
