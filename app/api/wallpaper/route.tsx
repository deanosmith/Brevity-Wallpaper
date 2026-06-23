import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { DISPLAY_CONFIG } from "@/lib/display-config";
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
  subValue?: string | null;
};

type TemperatureRangeData = {
  high: string | null;
  low: string | null;
  highGraph: number;
  lowGraph: number;
};

type MoonPhaseData = {
  phase: number;
  illumination: number;
};

const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14);

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
  const moonPhase = getMoonPhase(now);
  const scale = width / 1179;
  const centerX = width / 2;
  const displayLift = height * 0.08;
  const moonCenterY = height * 0.515 - displayLift;
  const sunMarkerY = moonCenterY + 18 * scale;
  const moonFrameSize = 318 * scale;
  const moonDiskSize = 226 * scale;
  const metricSize = 210 * scale;
  const metricGap = 45 * scale;
  const metricRowWidth = metricSize * 4 + metricGap * 3;
  const metricTop = height * 0.355 - displayLift;
  const yearProgress = formatYearProgress(now);
  const sunriseTime = DISPLAY_CONFIG.sections.sunrise ? formatTime12h(weather.sunrise) : null;
  const sunsetTime = DISPLAY_CONFIG.sections.sunset ? formatTime12h(weather.sunset) : null;
  const temperatureRange: TemperatureRangeData | null =
    DISPLAY_CONFIG.sections.weatherToday.high || DISPLAY_CONFIG.sections.weatherToday.low
      ? {
          high: DISPLAY_CONFIG.sections.weatherToday.high
            ? formatTemperature(weather.high, weather.temperatureUnitLabel)
            : null,
          low: DISPLAY_CONFIG.sections.weatherToday.low
            ? formatTemperature(weather.low, weather.temperatureUnitLabel)
            : null,
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

        <YearProgress value={yearProgress} left={width * 0.115} top={height * 0.116} scale={scale} />

        {sunriseTime ? (
          <SunTimeMarker
            icon="sunrise"
            value={sunriseTime}
            theme={theme}
            left={width * 0.19 - 85 * scale}
            top={sunMarkerY - 126 * scale}
            scale={scale}
          />
        ) : null}
        {sunsetTime ? (
          <SunTimeMarker
            icon="sunset"
            value={sunsetTime}
            theme={theme}
            left={width * 0.81 - 85 * scale}
            top={sunMarkerY - 126 * scale}
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
          <MoonPhase phase={moonPhase} size={moonDiskSize} />
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
      headers: {
        "cache-control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600",
      },
    },
  );
}

function StarryBackdrop({ width, height, theme }: { width: number; height: number; theme: ThemeTokens }) {
  const scale = width / 1179;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", position: "absolute", left: 0, top: 0 }}
    >
      {Array.from({ length: 72 }).map((_, index) => {
        const x = (((index * 113 + index * index * 31) % 1000) / 1000) * width;
        const y = (((index * 167 + index * index * 19) % 1000) / 1000) * height;
        const radius = (index % 29 === 0 ? 1.15 : index % 11 === 0 ? 0.9 : 0.62) * scale;
        const opacity = 0.22 + ((index * 23) % 36) / 100;

        return (
          <circle
            key={`backdrop-star-${index}`}
            cx={x}
            cy={y}
            r={Math.max(0.45, radius)}
            fill={index % 17 === 0 ? theme.starBright : theme.star}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function YearProgress({
  value,
  left,
  top,
  scale,
}: {
  value: string;
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
        color: "#ffffff",
        fontSize: 30 * scale,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {value}
    </div>
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

  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <DialRings progress={metric.graph ?? 0.2} theme={theme} size={size} />
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
  const progress = (range.highGraph + range.lowGraph) / 2;

  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <DialRings progress={progress} theme={theme} size={size} />
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
          gap: 5 * scale,
        }}
      >
        <span style={{ color: theme.ink, fontSize: 47 * scale, fontWeight: 500, lineHeight: 0.95 }}>
          {range.high ?? "--"}
        </span>
        <span style={{ color: theme.ink, fontSize: 32 * scale, fontWeight: 400, lineHeight: 0.95 }}>
          {range.low ?? "--"}
        </span>
      </div>
    </div>
  );
}

function DialRings({ progress, theme, size }: { progress: number; theme: ThemeTokens; size: number }) {
  const center = size / 2;
  const shellRadius = size * 0.47;
  const radius = size * 0.425;
  const innerRadius = size * 0.36;
  const arcEnd = -92 + Math.max(26, Math.min(286, progress * 286));
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
        d={arcPath(center, center, radius, -92, arcEnd)}
        fill="none"
        stroke={theme.accent}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <circle cx={end.x} cy={end.y} r={3.3} fill={theme.ink} opacity="0.85" />
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
      ? "M32 10 V16 M15 22 L20 26 M49 22 L44 26 M10 35 H16 M48 35 H54"
      : "M32 48 V54 M15 42 L20 38 M49 42 L44 38 M10 29 H16 M48 29 H54";

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
  return normalizeRatio(value, -10, 38);
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

function MoonPhase({ phase, size }: { phase: MoonPhaseData; size: number }) {
  const frameSize = size + 92;
  const center = 50;
  const radius = (size / frameSize) * 50;
  const terminatorRadius = Math.max(0.1, radius * Math.abs(Math.cos(2 * Math.PI * phase.phase)));
  const rightPath = moonSegmentPath(center, radius, terminatorRadius, "right");
  const leftPath = moonSegmentPath(center, radius, terminatorRadius, "left");
  const craters = [
    { cx: 61, cy: 33, r: 6.5, opacity: 0.16 },
    { cx: 69, cy: 48, r: 4.8, opacity: 0.14 },
    { cx: 56, cy: 62, r: 5.8, opacity: 0.12 },
    { cx: 73, cy: 65, r: 3.4, opacity: 0.12 },
    { cx: 45, cy: 38, r: 3.2, opacity: 0.08 },
    { cx: 65, cy: 24, r: 2.4, opacity: 0.13 },
    { cx: 49, cy: 74, r: 2.7, opacity: 0.1 },
  ];
  const shadow = "#050607";
  const moonElements = getMoonPhaseElements(phase.phase, phase.illumination, rightPath, leftPath);

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
      <svg width={frameSize} height={frameSize} viewBox="0 0 100 100" style={{ display: "block" }}>
        <defs>
          <radialGradient id="moonLight" cx="70%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="42%" stopColor="#d8d8d8" />
            <stop offset="78%" stopColor="#a3a3a3" />
            <stop offset="100%" stopColor="#626262" />
          </radialGradient>
          <radialGradient id="moonShadow" cx="46%" cy="46%" r="64%">
            <stop offset="0%" stopColor="#08090a" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <clipPath id="moonClip">
            <circle cx={center} cy={center} r={radius} />
          </clipPath>
        </defs>
        <g clipPath="url(#moonClip)">
          <circle cx={center} cy={center} r={radius} fill="url(#moonShadow)" />
          {moonElements.lightCircle ? (
            <circle cx={center} cy={center} r={radius} fill="url(#moonLight)" opacity="0.98" />
          ) : null}
          {moonElements.lightPath ? <path d={moonElements.lightPath} fill="url(#moonLight)" opacity="0.98" /> : null}
          {moonElements.shadowPath ? <path d={moonElements.shadowPath} fill={shadow} opacity="0.97" /> : null}
          <circle cx="71" cy="36" r="20" fill="#f4f4f4" opacity="0.08" />
          {craters.map((crater, index) => (
            <circle
              key={`moon-crater-${index}`}
              cx={crater.cx}
              cy={crater.cy}
              r={crater.r}
              fill="#202020"
              opacity={crater.opacity + phase.illumination * 0.04}
            />
          ))}
          {craters.map((crater, index) => (
            <circle
              key={`moon-crater-rim-${index}`}
              cx={crater.cx - 0.8}
              cy={crater.cy - 0.8}
              r={crater.r}
              fill="none"
              stroke="#eeeeee"
              strokeOpacity={0.05 + phase.illumination * 0.04}
              strokeWidth="0.6"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function getMoonPhaseElements(phase: number, illumination: number, rightPath: string, leftPath: string) {
  if (illumination < 0.015) {
    return {
      lightCircle: false,
      lightPath: null,
      shadowPath: null,
    };
  }

  if (illumination > 0.985) {
    return {
      lightCircle: true,
      lightPath: null,
      shadowPath: null,
    };
  }

  if (phase < 0.25) {
    return {
      lightCircle: false,
      lightPath: rightPath,
      shadowPath: null,
    };
  }

  if (phase < 0.5) {
    return {
      lightCircle: true,
      lightPath: null,
      shadowPath: leftPath,
    };
  }

  if (phase < 0.75) {
    return {
      lightCircle: true,
      lightPath: null,
      shadowPath: rightPath,
    };
  }

  return {
    lightCircle: false,
    lightPath: leftPath,
    shadowPath: null,
  };
}

function moonSegmentPath(center: number, radius: number, terminatorRadius: number, side: "left" | "right") {
  const outerSweep = side === "right" ? 1 : 0;
  const innerSweep = side === "right" ? 0 : 1;

  return [
    `M ${center} ${center - radius}`,
    `A ${radius} ${radius} 0 0 ${outerSweep} ${center} ${center + radius}`,
    `A ${terminatorRadius} ${radius} 0 0 ${innerSweep} ${center} ${center - radius}`,
    "Z",
  ].join(" ");
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
