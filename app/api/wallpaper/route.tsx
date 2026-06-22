import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { DISPLAY_CONFIG } from "@/lib/display-config";
import { getNkjvVerse } from "@/lib/verses";
import { getWeatherSnapshot, weatherCodeLabel } from "@/lib/weather";
import type { WeatherSnapshot } from "@/lib/weather";
import {
  DEFAULT_LOCATION,
  parseFiniteNumber,
  parseWallpaperSize,
  sanitizeLabel,
  sanitizeTemperatureUnit,
  sanitizeTheme,
  sanitizeWindUnit,
} from "@/lib/wallpaper-config";
import type { WallpaperTheme } from "@/lib/wallpaper-config";

export const runtime = "edge";

type ThemeTokens = {
  background: string;
  ink: string;
  muted: string;
  panel: string;
  panelStrong: string;
  accent: string;
  sun: string;
  horizon: string;
};

const THEMES: Record<WallpaperTheme, ThemeTokens> = {
  dawn: {
    background: "linear-gradient(180deg, #f6d3a6 0%, #ead3c8 42%, #2c6575 100%)",
    ink: "#14211f",
    muted: "#5f6f69",
    panel: "rgba(255, 249, 236, 0.72)",
    panelStrong: "rgba(255, 253, 246, 0.9)",
    accent: "#b96024",
    sun: "#ffbf69",
    horizon: "#2e7359",
  },
  garden: {
    background: "linear-gradient(180deg, #ecf1dc 0%, #d5e2c6 46%, #497260 100%)",
    ink: "#14211b",
    muted: "#5c6c61",
    panel: "rgba(250, 252, 240, 0.74)",
    panelStrong: "rgba(255, 255, 249, 0.92)",
    accent: "#2e7359",
    sun: "#eab960",
    horizon: "#8c6f45",
  },
  night: {
    background: "linear-gradient(180deg, #020408 0%, #060910 43%, #16050b 100%)",
    ink: "#fff4e7",
    muted: "#c8b8ad",
    panel: "rgba(18, 13, 17, 0.68)",
    panelStrong: "rgba(21, 12, 15, 0.82)",
    accent: "#f0ae74",
    sun: "#ffd39a",
    horizon: "#7f1522",
  },
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const size = parseWallpaperSize(searchParams.get("size") ?? DISPLAY_CONFIG.wallpaperSize);
  const width = parseFiniteNumber(searchParams.get("width"), size.width, 720, 1800);
  const height = parseFiniteNumber(searchParams.get("height"), size.height, 1280, 3600);
  const latitude = parseFiniteNumber(searchParams.get("lat"), DEFAULT_LOCATION.latitude, -90, 90);
  const longitude = parseFiniteNumber(searchParams.get("lon"), DEFAULT_LOCATION.longitude, -180, 180);
  const label = sanitizeLabel(searchParams.get("label"), DEFAULT_LOCATION.label);
  const themeName = sanitizeTheme(searchParams.get("theme") ?? DISPLAY_CONFIG.theme);
  const temperatureUnit = sanitizeTemperatureUnit(searchParams.get("temp") ?? DISPLAY_CONFIG.temperatureUnit);
  const windUnit = sanitizeWindUnit(searchParams.get("wind") ?? DISPLAY_CONFIG.windUnit);
  const customVerse = searchParams.get("verse") ?? undefined;
  const customReference = searchParams.get("reference") ?? undefined;
  const theme = THEMES[themeName];

  let weather: WeatherSnapshot;

  try {
    weather = await getWeatherSnapshot({
      latitude,
      longitude,
      temperatureUnit,
      windUnit,
    });
  } catch {
    weather = {
      date: new Date().toISOString().slice(0, 10),
      timezone: "Unavailable",
      high: null,
      low: null,
      rainChance: null,
      windMax: null,
      uvMax: null,
      sunrise: null,
      sunset: null,
      weatherCode: null,
      currentTemperature: null,
      currentWeatherCode: null,
      temperatureUnitLabel: temperatureUnit === "celsius" ? "C" : "F",
      windUnitLabel: windUnit === "kmh" ? "km/h" : "mph",
    };
  }

  const verse = getNkjvVerse(customVerse, customReference);
  const date = formatDate(weather.date);
  const condition = weatherCodeLabel(weather.currentWeatherCode ?? weather.weatherCode);
  const tempLabel = formatTemperature(weather.currentTemperature, weather.temperatureUnitLabel);
  const sidePadding = width > 1100 ? 92 : 74;
  const safeContentTop = height * 0.3;
  const safeContentHeight = height * 0.38;
  const labelFontSize = label.length > 28 ? 48 : label.length > 18 ? 56 : 64;
  const verseFontSize = verse.text.length > 150 ? 34 : verse.text.length > 95 ? 38 : 44;
  const solarMetrics = [
    DISPLAY_CONFIG.sections.sunrise ? { label: "Sunrise", value: formatTime(weather.sunrise) } : null,
    DISPLAY_CONFIG.sections.sunset ? { label: "Sunset", value: formatTime(weather.sunset) } : null,
  ].filter((metric): metric is { label: string; value: string } => Boolean(metric));
  const weatherMetrics = [
    DISPLAY_CONFIG.sections.weatherToday.high
      ? { label: "High", value: formatTemperature(weather.high, weather.temperatureUnitLabel) }
      : null,
    DISPLAY_CONFIG.sections.weatherToday.low
      ? { label: "Low", value: formatTemperature(weather.low, weather.temperatureUnitLabel) }
      : null,
    DISPLAY_CONFIG.sections.weatherToday.rainChance ? { label: "Rain", value: formatPercent(weather.rainChance) } : null,
    DISPLAY_CONFIG.sections.weatherToday.windMax
      ? { label: "Wind", value: formatWind(weather.windMax, weather.windUnitLabel) }
      : null,
    DISPLAY_CONFIG.sections.weatherToday.uvMax ? { label: "UV", value: formatUv(weather.uvMax) } : null,
  ].filter((metric): metric is { label: string; value: string } => Boolean(metric));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: theme.background,
          color: theme.ink,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: height * 0.29,
            background: "linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.3) 58%, rgba(0, 0, 0, 0) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: width * 0.9,
            height: width * 0.9,
            left: width * 0.05,
            top: height * 0.24,
            borderRadius: "999px",
            background: theme.sun,
            opacity: themeName === "night" ? 0.08 : 0.22,
          }}
        />
        {Array.from({ length: 104 }).map((_, index) => {
          const left = (index * 37) % 100;
          const top = 1 + ((index * 61) % 69);
          const size = index % 17 === 0 ? 5 : index % 7 === 0 ? 3 : 2;
          const opacity = 0.24 + ((index * 13) % 58) / 100;

          return (
            <div
              key={`star-${index}`}
              style={{
                display: "flex",
                position: "absolute",
                left: `${left}%`,
                top: `${top}%`,
                width: size,
                height: size,
                borderRadius: "999px",
                background: "#ffffff",
                opacity,
              }}
            />
          );
        })}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: height * 0.36,
            background: "linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(28, 5, 10, 0.38) 34%, rgba(86, 10, 22, 0.78) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: width * 0.18,
            bottom: height * 0.12,
            width: width * 0.64,
            height: height * 0.16,
            borderRadius: "999px",
            background: theme.sun,
            opacity: themeName === "night" ? 0.22 : 0.32,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: -width * 0.18,
            bottom: -height * 0.02,
            width: width * 0.74,
            height: height * 0.26,
            borderRadius: "999px 999px 0 0",
            background: theme.horizon,
            opacity: themeName === "night" ? 0.86 : 0.58,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: -width * 0.2,
            bottom: height * 0.02,
            width: width * 0.74,
            height: height * 0.28,
            borderRadius: "999px 999px 0 0",
            background: theme.accent,
            opacity: themeName === "night" ? 0.64 : 0.42,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: -width * 0.1,
            right: -width * 0.1,
            top: height * 0.69,
            height: 3,
            background: theme.horizon,
            opacity: 0.34,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            position: "absolute",
            left: sidePadding,
            right: sidePadding,
            top: safeContentTop,
            height: safeContentHeight,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 34,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: width * 0.58 }}>
              <span
                style={{
                  fontSize: 27,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  color: theme.muted,
                }}
              >
                {date}
              </span>
              <span
                style={{
                  fontSize: labelFontSize,
                  lineHeight: 1,
                  letterSpacing: 0,
                  fontWeight: 700,
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 25, color: theme.muted }}>{condition} / {weather.timezone}</span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 88, lineHeight: 0.9, fontWeight: 700 }}>{tempLabel}</span>
              <span style={{ fontSize: 25, color: theme.muted }}>Now</span>
            </div>
          </div>

          {solarMetrics.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: 14,
              }}
            >
              {solarMetrics.map((metric) => (
                <InfoPill key={metric.label} label={metric.label} value={metric.value} theme={theme} />
              ))}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 14,
            }}
          >
            {weatherMetrics.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} theme={theme} />
            ))}
          </div>

          {DISPLAY_CONFIG.sections.verseOfTheDay ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                border: `1px solid ${themeName === "night" ? "rgba(255, 226, 197, 0.18)" : "rgba(20, 30, 24, 0.12)"}`,
                borderRadius: 28,
                background: theme.panelStrong,
                padding: "30px 34px",
              }}
            >
              <span
                style={{
                  fontSize: 23,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  color: theme.accent,
                }}
              >
                {verse.translation} verse of the day
              </span>
              <span
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: verseFontSize,
                  lineHeight: 1.14,
                }}
              >
                {verse.text}
              </span>
              <span
                style={{
                  fontSize: 27,
                  color: theme.muted,
                }}
              >
                {verse.reference}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        "cache-control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}

function InfoPill({ label, value, theme }: { label: string; value: string; theme: ThemeTokens }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 210,
        borderRadius: 999,
        background: theme.panel,
        padding: "22px 30px",
      }}
    >
      <span style={{ fontSize: 22, color: theme.muted }}>{label}</span>
      <span style={{ fontSize: 34, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function MetricCard({ label, value, theme }: { label: string; value: string; theme: ThemeTokens }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: 184,
        borderRadius: 24,
        background: theme.panel,
        padding: 24,
      }}
    >
      <span style={{ fontSize: 22, color: theme.muted }}>{label}</span>
      <span style={{ fontSize: 38, fontWeight: 750 }}>{value}</span>
    </div>
  );
}

function formatDate(dateKey: string) {
  try {
    const [year, month, day] = dateKey.split("-").map(Number);

    if (!year || !month || !day) {
      return dateKey;
    }

    return new Intl.DateTimeFormat("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  } catch {
    return dateKey;
  }
}

function formatTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const time = value.split("T")[1]?.slice(0, 5);

  return time || "--";
}

function formatTemperature(value: number | null, unit: string) {
  if (value === null) {
    return "--";
  }

  return `${Math.round(value)}°${compactTemperatureUnit(unit)}`;
}

function compactTemperatureUnit(unit: string) {
  if (unit.includes("C") || unit.includes("c")) {
    return "C";
  }

  return "F";
}

function formatPercent(value: number | null) {
  return value === null ? "--" : `${Math.round(value)}%`;
}

function formatWind(value: number | null, unit: string) {
  return value === null ? "--" : `${Math.round(value)} ${unit}`;
}

function formatUv(value: number | null) {
  return value === null ? "--" : String(Math.round(value));
}
