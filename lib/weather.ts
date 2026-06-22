import type { TemperatureUnit, WindUnit } from "@/lib/wallpaper-config";

export type WeatherSnapshot = {
  date: string;
  timezone: string;
  high: number | null;
  low: number | null;
  rainChance: number | null;
  windMax: number | null;
  uvMax: number | null;
  sunrise: string | null;
  sunset: string | null;
  weatherCode: number | null;
  currentTemperature: number | null;
  currentWeatherCode: number | null;
  temperatureUnitLabel: string;
  windUnitLabel: string;
};

type OpenMeteoResponse = {
  timezone?: string;
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  current_units?: {
    temperature_2m?: string;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    uv_index_max?: number[];
    sunrise?: string[];
    sunset?: string[];
    weather_code?: number[];
  };
  daily_units?: {
    temperature_2m_max?: string;
    wind_speed_10m_max?: string;
  };
};

const WEATHER_REQUEST_TIMEOUT_MS = 4500;

export function weatherCodeLabel(code: number | null) {
  if (code === null) {
    return "Today";
  }

  if (code === 0) {
    return "Clear";
  }

  if ([1, 2, 3].includes(code)) {
    return "Partly cloudy";
  }

  if ([45, 48].includes(code)) {
    return "Fog";
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return "Drizzle";
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "Rain";
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "Snow";
  }

  if ([95, 96, 99].includes(code)) {
    return "Storms";
  }

  return "Weather";
}

export async function getWeatherSnapshot({
  latitude,
  longitude,
  temperatureUnit,
  windUnit,
}: {
  latitude: number;
  longitude: number;
  temperatureUnit: TemperatureUnit;
  windUnit: WindUnit;
}): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    forecast_days: "1",
    timezone: "auto",
    temperature_unit: temperatureUnit,
    wind_speed_unit: windUnit,
    current: "temperature_2m,weather_code",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,wind_speed_10m_max",
  });

  const timeoutSignal =
    typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS)
      : undefined;
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 60 * 30 },
    ...(timeoutSignal ? { signal: timeoutSignal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Weather request failed with ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const daily = data.daily ?? {};

  return {
    date: daily.time?.[0] ?? new Date().toISOString().slice(0, 10),
    timezone: data.timezone ?? "auto",
    high: valueAt(daily.temperature_2m_max),
    low: valueAt(daily.temperature_2m_min),
    rainChance: valueAt(daily.precipitation_probability_max),
    windMax: valueAt(daily.wind_speed_10m_max),
    uvMax: valueAt(daily.uv_index_max),
    sunrise: daily.sunrise?.[0] ?? null,
    sunset: daily.sunset?.[0] ?? null,
    weatherCode: valueAt(daily.weather_code),
    currentTemperature: data.current?.temperature_2m ?? null,
    currentWeatherCode: data.current?.weather_code ?? null,
    temperatureUnitLabel:
      data.daily_units?.temperature_2m_max ?? data.current_units?.temperature_2m ?? unitLabel(temperatureUnit),
    windUnitLabel: data.daily_units?.wind_speed_10m_max ?? (windUnit === "kmh" ? "km/h" : "mph"),
  };
}

function valueAt(values?: number[]) {
  const value = values?.[0];

  return Number.isFinite(value) ? value : null;
}

function unitLabel(unit: TemperatureUnit) {
  return unit === "celsius" ? "C" : "F";
}
