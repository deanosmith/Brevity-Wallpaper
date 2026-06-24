import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { DISPLAY_CONFIG } from "@/lib/display-config";
import {
  decodeStravaConnection,
  encodeStravaConnection,
  getStravaRunSummary,
  STRAVA_CONNECTION_COOKIE,
} from "@/lib/strava";
import type { StravaRunSummary } from "@/lib/strava";
import { getWeatherSnapshot } from "@/lib/weather";
import type { WeatherSnapshot } from "@/lib/weather";
import {
  DEFAULT_LOCATION,
  parseFiniteNumber,
  parseWallpaperSize,
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
  accent: string;
  line: string;
  star: string;
  starBright: string;
};

type MetricIconName =
  | "sunrise"
  | "sunset"
  | "temperature"
  | "rain"
  | "wind"
  | "uv"
  | "clear"
  | "cloud";

type MetricData = {
  id: string;
  value: string;
  icon: MetricIconName;
  graph?: number;
  hideDial?: boolean;
  subValue?: string | null;
};

type TemperatureRangeData = {
  high: string | null;
  low: string | null;
  highValue: number | null;
  lowValue: number | null;
  highGraph: number;
  lowGraph: number;
};

type MoonPhaseData = {
  phase: number;
  illumination: number;
};

type MoonPhaseAsset = {
  id: string;
  label: string;
  path: string;
};

type MoonPhaseImageData = MoonPhaseAsset & {
  src: string | null;
  illumination: number;
};

const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14);
const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;
const RAIN_DIAL_COLOR = "#2f9bff";
const UV_DIAL_COLOR = "#ff3b30";
const TEMPERATURE_DIAL_MIN = -6;
const TEMPERATURE_DIAL_MAX = 30;
const TEMPERATURE_DIAL_SWEEP = 356;
const MOON_PHASE_ASSET_VERSION = "hires-1024-20260623";
const MOON_PHASE_ASSET_TIMEOUT_MS = 2500;
const DEFAULT_WALLPAPER_TIME_ZONE = "Europe/Copenhagen";
const MOON_PHASE_ASSETS: MoonPhaseAsset[] = [
  { id: "new", label: "New moon", path: "/moon-phases/phase_new.png" },
  { id: "waxing-crescent", label: "Waxing crescent", path: "/moon-phases/phase_waxing_crescent.png" },
  { id: "first-quarter", label: "First quarter", path: "/moon-phases/phase_first_quarter.png" },
  { id: "waxing-gibbous", label: "Waxing gibbous", path: "/moon-phases/phase_waxing_gibbous.png" },
  { id: "full", label: "Full moon", path: "/moon-phases/phase_full.png" },
  { id: "waning-gibbous", label: "Waning gibbous", path: "/moon-phases/phase_waning_gibbous.png" },
  { id: "third-quarter", label: "Third quarter", path: "/moon-phases/phase_third_quarter.png" },
  { id: "waning-crescent", label: "Waning crescent", path: "/moon-phases/phase_waning_crescent.png" },
];
const moonPhaseImageCache = new Map<string, Promise<string | null>>();

const THEMES: Record<WallpaperTheme, ThemeTokens> = {
  dawn: {
    background: "#000000",
    ink: "#f4f4f4",
    muted: "#9f9f9f",
    panel: "rgba(20, 18, 22, 0.64)",
    accent: "#c0c0c0",
    line: "rgba(192, 192, 192, 0.2)",
    star: "rgba(255, 255, 255, 0.62)",
    starBright: "rgba(255, 255, 255, 0.94)",
  },
  garden: {
    background: "#000000",
    ink: "#f4f4f4",
    muted: "#9f9f9f",
    panel: "rgba(16, 22, 20, 0.64)",
    accent: "#c0c0c0",
    line: "rgba(192, 192, 192, 0.19)",
    star: "rgba(255, 255, 255, 0.6)",
    starBright: "rgba(255, 255, 255, 0.94)",
  },
  night: {
    background: "#000000",
    ink: "#f4f4f4",
    muted: "#9f9f9f",
    panel: "rgba(17, 15, 20, 0.64)",
    accent: "#c0c0c0",
    line: "rgba(192, 192, 192, 0.2)",
    star: "rgba(255, 255, 255, 0.58)",
    starBright: "rgba(255, 255, 255, 0.94)",
  },
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const size = parseWallpaperSize(searchParams.get("size") ?? DISPLAY_CONFIG.wallpaperSize);
  const width = parseFiniteNumber(searchParams.get("width"), size.width, 720, 1800);
  const height = parseFiniteNumber(searchParams.get("height"), size.height, 1280, 3600);
  const latitude = parseFiniteNumber(searchParams.get("lat"), DEFAULT_LOCATION.latitude, -90, 90);
  const longitude = parseFiniteNumber(searchParams.get("lon"), DEFAULT_LOCATION.longitude, -180, 180);
  const themeName = sanitizeTheme(searchParams.get("theme") ?? DISPLAY_CONFIG.theme);
  const temperatureUnit = sanitizeTemperatureUnit(searchParams.get("temp") ?? DISPLAY_CONFIG.temperatureUnit);
  const windUnit = sanitizeWindUnit(searchParams.get("wind") ?? DISPLAY_CONFIG.windUnit);
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
      rainPeakTime: null,
      windMax: null,
      windDirection: null,
      uvMax: null,
      sunrise: null,
      sunset: null,
      weatherCode: null,
      currentWeatherCode: null,
      temperatureUnitLabel: temperatureUnit === "celsius" ? "C" : "F",
      windUnitLabel: windUnit === "kmh" ? "km/h" : "mph",
    };
  }

  const now = Date.now();
  const nowDate = new Date(now);
  const moonPhase = getMoonPhase(now);
  const moonPhaseImagePromise = getMoonPhaseImage(moonPhase, request.nextUrl.origin);
  const scale = width / 1179;
  const centerX = width / 2;
  const displayLift = height * 0.08;
  const moonCenterY = height * 0.515 - displayLift;
  const sunMarkerTop = moonCenterY - 48 * scale;
  const moonFrameSize = 318 * scale;
  const moonDiskSize = 226 * scale;
  const metricSize = 210 * scale;
  const metricGap = 45 * scale;
  const metricRowWidth = metricSize * 4 + metricGap * 3;
  const metricTop = height * 0.355 - displayLift;
  const topIconRowTop = height * 0.116 - 40 * scale;
  const topEdgeInset = width * 0.095;
  const yearProgress = formatYearProgress(now);
  const dateStamp = formatDayMonth(nowDate);
  const sunriseTime = DISPLAY_CONFIG.sections.sunrise ? formatTime12h(weather.sunrise) : null;
  const sunsetTime = DISPLAY_CONFIG.sections.sunset ? formatTime12h(weather.sunset) : null;
  const stravaCookieValue = request.cookies.get(STRAVA_CONNECTION_COOKIE)?.value;
  const stravaConnection = decodeStravaConnection(stravaCookieValue);
  const stravaSummary = await safelyGetStravaRunSummary(nowDate, stravaConnection);
  const temperatureRange: TemperatureRangeData | null =
    DISPLAY_CONFIG.sections.weatherToday.high || DISPLAY_CONFIG.sections.weatherToday.low
      ? {
          high: DISPLAY_CONFIG.sections.weatherToday.high
            ? formatTemperature(weather.high, weather.temperatureUnitLabel)
            : null,
          low: DISPLAY_CONFIG.sections.weatherToday.low
            ? formatTemperature(weather.low, weather.temperatureUnitLabel)
            : null,
          highValue: DISPLAY_CONFIG.sections.weatherToday.high ? weather.high : null,
          lowValue: DISPLAY_CONFIG.sections.weatherToday.low ? weather.low : null,
          highGraph: normalizeTemperature(weather.high),
          lowGraph: normalizeTemperature(weather.low),
        }
      : null;
  const weatherMetricItems: Array<MetricData | null> = [
    DISPLAY_CONFIG.sections.weatherToday.rainChance
      ? {
          id: "rain",
          value: formatPercent(weather.rainChance),
          icon: "rain",
          graph: normalizePercent(weather.rainChance),
          hideDial: isRoundedZero(weather.rainChance),
          subValue: formatRainPeakTime(weather.rainChance, weather.rainPeakTime),
        }
      : null,
    DISPLAY_CONFIG.sections.weatherToday.windMax
      ? {
          id: "wind",
          value: formatWind(weather.windMax, weather.windUnitLabel),
          icon: "wind",
          graph: normalizeWind(weather.windMax),
          subValue: formatWindDirection(weather.windDirection),
        }
      : null,
    DISPLAY_CONFIG.sections.weatherToday.uvMax
      ? {
          id: "uv",
          value: formatUv(weather.uvMax),
          icon: "uv",
          graph: normalizeUv(weather.uvMax),
        }
      : null,
  ];
  const weatherMetrics = weatherMetricItems.filter((metric): metric is MetricData => Boolean(metric));
  const rainMetric = weatherMetrics.find((metric) => metric.id === "rain");
  const windMetric = weatherMetrics.find((metric) => metric.id === "wind");
  const uvMetric = weatherMetrics.find((metric) => metric.id === "uv");
  const moonPhaseImage = await moonPhaseImagePromise;
  const headers: Record<string, string> = {
    "cache-control": "private, no-store",
  };
  const updatedStravaCookie = stravaConnection ? encodeStravaConnection(stravaConnection) : null;

  if (updatedStravaCookie && stravaCookieValue && updatedStravaCookie !== stravaCookieValue) {
    headers["set-cookie"] = serializeStravaCookie(updatedStravaCookie, request.nextUrl.protocol === "https:");
  }

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
          fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
        }}
      >
        <StarryBackdrop width={width} height={height} theme={theme} />

        <CalendarProgress
          value={yearProgress}
          date={dateStamp}
          theme={theme}
          left={topEdgeInset}
          top={topIconRowTop}
          scale={scale}
        />

        <RunningSummary
          summary={stravaSummary}
          theme={theme}
          left={width - topEdgeInset - width * 0.135}
          top={topIconRowTop}
          width={width * 0.135}
          scale={scale}
        />

        {sunriseTime ? (
          <SunTimeMarker
            icon="sunrise"
            value={sunriseTime}
            theme={theme}
            left={width * 0.19 - 85 * scale}
            top={sunMarkerTop}
            scale={scale}
          />
        ) : null}
        {sunsetTime ? (
          <SunTimeMarker
            icon="sunset"
            value={sunsetTime}
            theme={theme}
            left={width * 0.81 - 85 * scale}
            top={sunMarkerTop}
            scale={scale}
          />
        ) : null}

        <div
          style={{
            display: "flex",
            position: "absolute",
            left: centerX - moonFrameSize / 2,
            top: moonCenterY - moonFrameSize / 2,
            width: moonFrameSize,
            height: moonFrameSize,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MoonPhase image={moonPhaseImage} size={moonDiskSize} />
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            left: centerX - metricRowWidth / 2,
            top: metricTop,
            gap: metricGap,
          }}
        >
          {rainMetric ? <MetricDial metric={rainMetric} theme={theme} size={metricSize} scale={scale} /> : null}
          {windMetric ? <MetricDial metric={windMetric} theme={theme} size={metricSize} scale={scale} /> : null}
          {temperatureRange ? (
            <TemperatureDial range={temperatureRange} theme={theme} size={metricSize} scale={scale} />
          ) : null}
          {uvMetric ? <MetricDial metric={uvMetric} theme={theme} size={metricSize} scale={scale} /> : null}
        </div>
      </div>
    ),
    {
      width,
      height,
      headers,
    },
  );
}

function serializeStravaCookie(value: string, secure: boolean) {
  return [
    `${STRAVA_CONNECTION_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${SIX_MONTHS_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function StarryBackdrop({ width, height, theme }: { width: number; height: number; theme: ThemeTokens }) {
  const scale = width / 1179;
  const tinyStars = Array.from({ length: 750 });
  const brightStars = Array.from({ length: 102 });
  const starTones = ["#f7f9ff", "#dbe8ff", "#fff4dd", "#e8f1ff"];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", position: "absolute", left: 0, top: 0 }}
    >
      <rect width={width} height={height} fill={theme.background} />
      {tinyStars.map((_, index) => {
        const x = hashUnit(index, 3) * width;
        const y = hashUnit(index, 11) * height;
        const radius = (0.28 + hashUnit(index, 19) * 0.42) * scale;
        const opacity = 0.08 + hashUnit(index, 29) * 0.22;

        return (
          <circle
            key={`backdrop-faint-star-${index}`}
            cx={x}
            cy={y}
            r={Math.max(0.45, radius)}
            fill={starTones[index % starTones.length]}
            opacity={opacity}
          />
        );
      })}
      {brightStars.map((_, index) => {
        const x = hashUnit(index, 41) * width;
        const y = hashUnit(index, 47) * height;
        const radius = (0.65 + hashUnit(index, 53) * 0.9) * scale;
        const opacity = 0.22 + hashUnit(index, 59) * 0.34;

        return (
          <circle
            key={`backdrop-bright-star-${index}`}
            cx={x}
            cy={y}
            r={Math.max(0.55, radius)}
            fill={index % 5 === 0 ? theme.starBright : starTones[(index + 1) % starTones.length]}
            opacity={opacity}
          />
        );
      })}
      {Array.from({ length: 27 }).map((_, index) => {
        const x = hashUnit(index, 67) * width;
        const y = hashUnit(index, 71) * height;
        const ray = (2.1 + hashUnit(index, 73) * 1.4) * scale;

        return (
          <g key={`backdrop-star-glint-${index}`} opacity={0.13 + hashUnit(index, 79) * 0.12}>
            <line
              x1={x}
              y1={y - ray}
              x2={x}
              y2={y + ray}
              stroke={theme.starBright}
              strokeWidth={0.65 * scale}
              strokeLinecap="round"
            />
            <line
              x1={x - ray}
              y1={y}
              x2={x + ray}
              y2={y}
              stroke={theme.starBright}
              strokeWidth={0.65 * scale}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

function hashUnit(index: number, salt: number) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;

  return value - Math.floor(value);
}

function CalendarProgress({
  value,
  date,
  theme,
  left,
  top,
  scale,
}: {
  value: string;
  date: string;
  theme: ThemeTokens;
  left: number;
  top: number;
  scale: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left,
        top,
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10 * scale,
        color: "#ffffff",
      }}
    >
      <CalendarIcon theme={theme} size={28 * scale} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 5 * scale,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 30 * scale,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          {value}
        </span>
        <span
          style={{
            color: theme.muted,
            fontSize: 21 * scale,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          {date}
        </span>
      </div>
    </div>
  );
}

function RunningSummary({
  summary,
  theme,
  left,
  top,
  width,
  scale,
}: {
  summary: StravaRunSummary | null;
  theme: ThemeTokens;
  left: number;
  top: number;
  width: number;
  scale: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left,
        top,
        width,
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 9 * scale,
        color: theme.ink,
      }}
    >
      <RunningIcon theme={theme} size={40 * scale} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 5 * scale,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 24 * scale,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          {formatStravaDistance(summary?.lastWeekDistanceKm ?? null)}
        </span>
        <span
          style={{
            color: theme.muted,
            fontSize: 21 * scale,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          {formatStravaDistance(summary?.lastFourWeeksDistanceKm ?? null)}
        </span>
      </div>
    </div>
  );
}

function CalendarIcon({ theme, size }: { theme: ThemeTokens; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: "block" }}>
      <path
        d="M8 5 V10 M24 5 V10 M6 12 H26 M7 8 H25 C26.7 8 28 9.3 28 11 V25 C28 26.7 26.7 28 25 28 H7 C5.3 28 4 26.7 4 25 V11 C4 9.3 5.3 8 7 8 Z"
        fill="none"
        stroke={theme.ink}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M10 17 H12 M16 17 H18 M22 17 H24 M10 22 H12 M16 22 H18"
        fill="none"
        stroke={theme.ink}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.58"
      />
    </svg>
  );
}

function RunningIcon({ theme, size }: { theme: ThemeTokens; size: number }) {
  const stridePath = [
    "M28.5 15.5 C25 17.2 22.6 20.5 21.2 24.8 L28.8 29.2",
    "M26.6 18.3 L18.8 20.2 L14 16.2",
    "M27.5 18.8 L35.2 24.2 L41 22.8",
    "M28.8 29.2 L37 32.2 L43.5 40.5 M43.5 40.5 L47 40.5",
    "M26.6 28.2 L18.4 35.2 L10.5 35.2",
  ].join(" ");

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block" }}>
      <circle cx="31.5" cy="8" r="3.8" fill="none" stroke={theme.ink} strokeWidth="3" opacity="0.92" />
      <path
        d={stridePath}
        fill="none"
        stroke={theme.ink}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M21.2 24.8 C24.2 25.6 26.6 27 28.8 29.2"
        fill="none"
        stroke={theme.ink}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

function SunTimeMarker({
  icon,
  value,
  theme,
  left,
  top,
  scale,
}: {
  icon: "sunrise" | "sunset";
  value: string;
  theme: ThemeTokens;
  left: number;
  top: number;
  scale: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left,
        top,
        width: 170 * scale,
        flexDirection: "column",
        alignItems: "center",
        gap: 7 * scale,
      }}
    >
      <LineIcon icon={icon} theme={theme} size={54 * scale} />
      <span
        style={{
          color: theme.ink,
          fontSize: 35 * scale,
          fontWeight: 300,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MetricDial({
  metric,
  theme,
  size,
  scale,
}: {
  metric: MetricData;
  theme: ThemeTokens;
  size: number;
  scale: number;
}) {
  const valueFontSize = metric.id === "wind" ? 35 * scale : 49 * scale;
  const hasSubValue = Boolean(metric.subValue);
  const dialColor = getMetricDialColor(metric.id, theme);

  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      {metric.hideDial ? null : (
        <DialRings progress={metric.graph ?? 0.2} theme={theme} size={size} accent={dialColor} />
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          right: 0,
          top: size * 0.18,
          justifyContent: "center",
          opacity: 0.82,
        }}
      >
        <LineIcon icon={metric.icon} theme={theme} size={42 * scale} />
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          right: 0,
          top: hasSubValue ? size * 0.49 : size * 0.54,
          justifyContent: "center",
        }}
      >
        <span style={{ color: theme.ink, fontSize: valueFontSize, fontWeight: 500, lineHeight: 0.95 }}>
          {metric.value}
        </span>
      </div>
      {hasSubValue ? (
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            top: size * 0.76,
            alignItems: "center",
            justifyContent: "center",
            gap: 8 * scale,
          }}
        >
          {metric.id === "wind" ? <DirectionGlyph theme={theme} size={17 * scale} /> : null}
          <span style={{ color: theme.accent, fontSize: 23 * scale, fontWeight: 300, lineHeight: 1 }}>
            {metric.subValue}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DirectionGlyph({ theme, size }: { theme: ThemeTokens; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: "block" }}>
      <path
        d="M3 3 L17 9 L10 11 L8 18 Z"
        fill="none"
        stroke={theme.accent}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TemperatureDial({
  range,
  theme,
  size,
  scale,
}: {
  range: TemperatureRangeData;
  theme: ThemeTokens;
  size: number;
  scale: number;
}) {
  const highColor = temperatureColor(range.highGraph);
  const lowColor = temperatureColor(range.lowGraph);

  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <TemperatureDialRings range={range} theme={theme} size={size} />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          right: 0,
          top: size * 0.17,
          justifyContent: "center",
          opacity: 0.82,
        }}
      >
        <LineIcon icon="temperature" theme={theme} size={42 * scale} />
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          right: 0,
          top: size * 0.42,
          flexDirection: "column",
          alignItems: "center",
          gap: 7 * scale,
        }}
      >
        <span style={{ color: highColor, fontSize: 45 * scale, fontWeight: 500, lineHeight: 0.95 }}>
          {range.high ?? "--"}
        </span>
        <span style={{ color: lowColor, fontSize: 31 * scale, fontWeight: 400, lineHeight: 0.95 }}>
          {range.low ?? "--"}
        </span>
      </div>
    </div>
  );
}

function TemperatureDialRings({ range, theme, size }: { range: TemperatureRangeData; theme: ThemeTokens; size: number }) {
  const center = size / 2;
  const shellRadius = size * 0.47;
  const radius = size * 0.425;
  const innerRadius = size * 0.36;
  const arcStart = 90;
  const segmentCount = 40;
  const hasHigh = range.highValue !== null;
  const hasLow = range.lowValue !== null;
  const activeStart = Math.min(hasLow ? range.lowGraph : range.highGraph, hasHigh ? range.highGraph : range.lowGraph);
  const activeEnd = Math.max(hasLow ? range.lowGraph : range.highGraph, hasHigh ? range.highGraph : range.lowGraph);
  const highAngle = arcStart + range.highGraph * TEMPERATURE_DIAL_SWEEP;
  const lowAngle = arcStart + range.lowGraph * TEMPERATURE_DIAL_SWEEP;
  const highPoint = polarPoint(center, center, radius, highAngle);
  const lowPoint = polarPoint(center, center, radius, lowAngle);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", position: "absolute" }}>
      <circle
        cx={center}
        cy={center}
        r={shellRadius}
        fill="rgba(0, 0, 0, 0.3)"
        stroke={theme.accent}
        strokeOpacity="0.34"
        strokeWidth={1.4}
      />
      <circle cx={center} cy={center} r={radius} fill="none" stroke={theme.line} strokeOpacity="0.42" />
      <circle cx={center} cy={center} r={innerRadius} fill="none" stroke={theme.line} strokeOpacity="0.24" />
      {Array.from({ length: segmentCount }).map((_, index) => {
        const startRatio = index / segmentCount;
        const endRatio = Math.min(1, (index + 0.74) / segmentCount);
        const midRatio = (startRatio + endRatio) / 2;
        const active = (hasHigh || hasLow) && midRatio >= activeStart && midRatio <= activeEnd;

        return (
          <path
            key={`temperature-spectrum-${index}`}
            d={arcPath(
              center,
              center,
              radius,
              arcStart + startRatio * TEMPERATURE_DIAL_SWEEP,
              arcStart + endRatio * TEMPERATURE_DIAL_SWEEP,
            )}
            fill="none"
            stroke={temperatureColor(midRatio)}
            strokeWidth={active ? 4.4 : 2.4}
            strokeLinecap="round"
            strokeOpacity={active ? 0.96 : 0.24}
          />
        );
      })}
      {hasLow ? (
        <circle
          cx={lowPoint.x}
          cy={lowPoint.y}
          r={4.1}
          fill={temperatureColor(range.lowGraph)}
          stroke="#ffffff"
          strokeOpacity="0.76"
          strokeWidth={1.1}
        />
      ) : null}
      {hasHigh ? (
        <circle
          cx={highPoint.x}
          cy={highPoint.y}
          r={4.7}
          fill={temperatureColor(range.highGraph)}
          stroke="#ffffff"
          strokeOpacity="0.82"
          strokeWidth={1.2}
        />
      ) : null}
      <circle cx={center} cy={center} r={size * 0.495} fill="none" stroke={theme.line} strokeOpacity="0.2" />
    </svg>
  );
}

function temperatureColor(progress: number) {
  if (progress < 0.25) {
    return interpolateHex("#4da3ff", "#35d7ff", progress / 0.25);
  }

  if (progress < 0.5) {
    return interpolateHex("#35d7ff", "#ffd166", (progress - 0.25) / 0.25);
  }

  if (progress < 0.75) {
    return interpolateHex("#ffd166", "#ff9f0a", (progress - 0.5) / 0.25);
  }

  return interpolateHex("#ff9f0a", "#ff453a", (progress - 0.75) / 0.25);
}

function interpolateHex(start: string, end: string, amount: number) {
  const ratio = Math.min(1, Math.max(0, amount));
  const startColor = hexToRgb(start);
  const endColor = hexToRgb(end);
  const channel = (from: number, to: number) => Math.round(from + (to - from) * ratio);

  return `rgb(${channel(startColor.r, endColor.r)}, ${channel(startColor.g, endColor.g)}, ${channel(startColor.b, endColor.b)})`;
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function getMetricDialColor(id: string, theme: ThemeTokens) {
  if (id === "rain") {
    return RAIN_DIAL_COLOR;
  }

  if (id === "uv") {
    return UV_DIAL_COLOR;
  }

  return theme.accent;
}

function DialRings({
  progress,
  theme,
  size,
  accent,
}: {
  progress: number;
  theme: ThemeTokens;
  size: number;
  accent: string;
}) {
  const center = size / 2;
  const shellRadius = size * 0.47;
  const radius = size * 0.425;
  const innerRadius = size * 0.36;
  const arcStart = 90;
  const arcEnd = arcStart + Math.max(26, Math.min(286, progress * 286));
  const end = polarPoint(center, center, radius, arcEnd);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", position: "absolute" }}>
      <circle
        cx={center}
        cy={center}
        r={shellRadius}
        fill="rgba(0, 0, 0, 0.3)"
        stroke={theme.accent}
        strokeOpacity="0.34"
        strokeWidth={1.4}
      />
      <circle cx={center} cy={center} r={radius} fill="none" stroke={theme.line} strokeOpacity="0.58" />
      <circle cx={center} cy={center} r={innerRadius} fill="none" stroke={theme.line} strokeOpacity="0.24" />
      <path
        d={arcPath(center, center, radius, arcStart, arcEnd)}
        fill="none"
        stroke={accent}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <circle cx={end.x} cy={end.y} r={3.3} fill={accent} opacity="0.95" />
      <circle cx={center} cy={center} r={size * 0.495} fill="none" stroke={theme.line} strokeOpacity="0.2" />
    </svg>
  );
}

function LineIcon({ icon, theme, size }: { icon: MetricIconName; theme: ThemeTokens; size: number }) {
  const color = theme.accent;
  const muted = theme.ink;
  const stroke = 3.2;

  if (icon === "rain") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
        <path
          d="M32 10 C24 23 18 31 18 41 C18 50 24 56 32 56 C40 56 46 50 46 41 C46 31 40 23 32 10 Z"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "wind") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
        <path d="M12 24 H43 C49 24 51 17 46 14 C42 12 38 14 37 18" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        <path d="M8 34 H49 C56 34 58 44 50 47 C45 49 41 46 40 42" fill="none" stroke={muted} strokeWidth={stroke} strokeLinecap="round" opacity="0.8" />
        <path d="M17 44 H33" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "temperature") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
        <path
          d="M31 11 V37"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d="M25 38 V17 C25 11 37 11 37 17 V38 C42 41 45 46 45 51 C45 59 19 59 19 51 C19 46 22 41 25 38 Z"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        <path d="M43 20 H51 M43 29 H49" fill="none" stroke={muted} strokeWidth={2.4} strokeLinecap="round" opacity="0.75" />
      </svg>
    );
  }

  if (icon === "uv" || icon === "clear") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
        <circle cx="32" cy="32" r="9" fill="none" stroke={color} strokeWidth={stroke} />
        <path
          d="M32 9 V17 M32 47 V55 M9 32 H17 M47 32 H55 M16 16 L22 22 M42 42 L48 48 M48 16 L42 22 M22 42 L16 48"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "sunrise" || icon === "sunset") {
    const arc = icon === "sunrise" ? "M20 35 A12 12 0 0 1 44 35" : "M20 29 A12 12 0 0 0 44 29";
    const horizon = icon === "sunrise" ? 35 : 29;
    const rays = icon === "sunrise"
      ? "M32 10 V23 M15 22 L20 26 M49 22 L44 26 M10 35 H16 M48 35 H54"
      : "M32 41 V54 M15 42 L20 38 M49 42 L44 38 M10 29 H16 M48 29 H54";

    return (
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
        <path d={arc} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M9 ${horizon} H55`} fill="none" stroke={muted} strokeWidth={stroke} strokeLinecap="round" opacity="0.8" />
        <path d={rays} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
      <path
        d="M20 42 H47 C54 42 58 37 58 31 C58 25 53 20 47 20 C44 12 36 9 29 13 C24 16 21 20 20 26 C13 26 8 31 8 38 C8 40 11 42 20 42 Z"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function normalizeTemperature(value: number | null) {
  return normalizeRatio(value, TEMPERATURE_DIAL_MIN, TEMPERATURE_DIAL_MAX);
}

function normalizePercent(value: number | null) {
  return normalizeRatio(value, 0, 100);
}

function normalizeWind(value: number | null) {
  return normalizeRatio(value, 0, 60);
}

function normalizeUv(value: number | null) {
  return normalizeRatio(value, 0, 11);
}

function normalizeRatio(value: number | null, min: number, max: number) {
  if (value === null) {
    return 0.16;
  }

  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function isRoundedZero(value: number | null) {
  return value !== null && Math.round(value) === 0;
}

async function safelyGetStravaRunSummary(now: Date, stravaConnection: ReturnType<typeof decodeStravaConnection>) {
  try {
    return await getStravaRunSummary(now, stravaConnection);
  } catch {
    return null;
  }
}

function formatOptionalTime12h(value: string | null) {
  if (!value) {
    return null;
  }

  return formatTime12h(value);
}

function formatRainPeakTime(chance: number | null, value: string | null) {
  if (chance === null || Math.round(chance) <= 0) {
    return null;
  }

  return formatOptionalTime12h(value);
}

function formatYearProgress(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  const progress = ((timestamp - yearStart) / (nextYearStart - yearStart)) * 100;

  return `${Math.max(0, Math.min(100, progress)).toFixed(1)}%`;
}

function formatDayMonth(date: Date) {
  const timeZone =
    process.env.WALLPAPER_TIME_ZONE?.trim() || process.env.STRAVA_TIME_ZONE?.trim() || DEFAULT_WALLPAPER_TIME_ZONE;

  return (
    formatDayMonthInTimeZone(date, timeZone) ??
    formatDayMonthInTimeZone(date, DEFAULT_WALLPAPER_TIME_ZONE) ??
    "--/--"
  );
}

function formatDayMonthInTimeZone(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
    }).formatToParts(date);
    const day = parts.find((part) => part.type === "day")?.value ?? "--";
    const month = parts.find((part) => part.type === "month")?.value ?? "--";

    return `${day}/${month}`;
  } catch {
    return null;
  }
}

function formatStravaDistance(value: number | null) {
  if (value === null) {
    return "-- km";
  }

  if (value >= 100) {
    return `${Math.round(value)} km`;
  }

  return `${value.toFixed(1)} km`;
}

function formatTime12h(value: string | null) {
  if (!value) {
    return "--";
  }

  const time = value.split("T")[1]?.slice(0, 5);
  const [hourValue, minute = "00"] = time?.split(":") ?? [];
  const hour = Number(hourValue);

  if (!Number.isFinite(hour)) {
    return "--";
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minute} ${period}`;
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

function formatWindDirection(value: number | null) {
  if (value === null) {
    return null;
  }

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round((((value % 360) + 360) % 360) / 45) % directions.length;

  return directions[index];
}

function formatUv(value: number | null) {
  return value === null ? "--" : String(Math.round(value));
}

function getMoonPhase(timestamp: number): MoonPhaseData {
  const daysSinceNewMoon = (timestamp - KNOWN_NEW_MOON_UTC) / 86_400_000;
  const age = positiveModulo(daysSinceNewMoon, SYNODIC_MONTH_DAYS);
  const phase = age / SYNODIC_MONTH_DAYS;

  return {
    phase,
    illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2,
  };
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

async function getMoonPhaseImage(phase: MoonPhaseData, origin: string): Promise<MoonPhaseImageData> {
  const asset = getMoonPhaseAsset(phase.phase);
  const src = await loadMoonPhaseImageSource(asset, origin);

  return {
    ...asset,
    src,
    illumination: phase.illumination,
  };
}

function getMoonPhaseAsset(phase: number) {
  const normalizedPhase = positiveModulo(phase, 1);
  const assetIndex = Math.round(normalizedPhase * MOON_PHASE_ASSETS.length) % MOON_PHASE_ASSETS.length;

  return MOON_PHASE_ASSETS[assetIndex];
}

function loadMoonPhaseImageSource(asset: MoonPhaseAsset, origin: string) {
  const url = new URL(asset.path, origin);
  url.searchParams.set("v", MOON_PHASE_ASSET_VERSION);

  const cacheKey = url.toString();
  const cached = moonPhaseImageCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const loaded = fetch(cacheKey, {
    cache: "force-cache",
    signal: moonPhaseAssetSignal(),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Moon phase asset failed with ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "image/png";
      const buffer = await response.arrayBuffer();

      return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
    })
    .catch(() => null);

  moonPhaseImageCache.set(cacheKey, loaded);

  return loaded;
}

function moonPhaseAssetSignal() {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(MOON_PHASE_ASSET_TIMEOUT_MS);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), MOON_PHASE_ASSET_TIMEOUT_MS);

  return controller.signal;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function MoonPhase({ image, size }: { image: MoonPhaseImageData; size: number }) {
  const frameSize = size + 92;
  const illumination = Math.round(image.illumination * 100);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: frameSize,
        height: frameSize,
        borderRadius: 999,
      }}
    >
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          overflow: "hidden",
          borderRadius: 999,
          background: "#000000",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {image.src ? (
          <img
            src={image.src}
            width={size}
            height={size}
            alt={`${image.label}, ${illumination}% illuminated`}
            style={{
              display: "block",
              width: size,
              height: size,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: size,
              height: size,
              borderRadius: 999,
              background: "#020202",
              borderColor: "rgba(255, 255, 255, 0.18)",
              borderStyle: "solid",
              borderWidth: 1,
            }}
          />
        )}
      </div>
    </div>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}
