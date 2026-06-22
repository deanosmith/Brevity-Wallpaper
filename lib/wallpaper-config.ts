export type WallpaperTheme = "dawn" | "garden" | "night";
export type TemperatureUnit = "fahrenheit" | "celsius";
export type WindUnit = "mph" | "kmh";

export type WallpaperSize = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export const IPHONE_15_SIZE: WallpaperSize = {
  id: "iphone-15",
  label: "iPhone 15",
  width: 1179,
  height: 2556,
};

export const WALLPAPER_SIZES: WallpaperSize[] = [
  IPHONE_15_SIZE,
];

export const DEFAULT_SIZE = IPHONE_15_SIZE;

export const THEME_LABELS: Record<WallpaperTheme, string> = {
  dawn: "Dawn",
  garden: "Garden",
  night: "Dark",
};

export const DEFAULT_THEME: WallpaperTheme = "night";

export const DEFAULT_LOCATION = {
  label: "Copenhagen",
  latitude: 55.6761,
  longitude: 12.5683,
};

export function parseWallpaperSize(value: string | null): WallpaperSize {
  const match = WALLPAPER_SIZES.find((size) => size.id === value);
  return match ?? DEFAULT_SIZE;
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function parseFiniteNumber(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampNumber(parsed, min, max);
}

export function sanitizeLabel(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim().slice(0, 52);

  return trimmed || fallback;
}

export function sanitizeTheme(value: string | null): WallpaperTheme {
  if (value === "garden" || value === "night" || value === "dawn") {
    return value;
  }

  return DEFAULT_THEME;
}

export function sanitizeTemperatureUnit(value: string | null): TemperatureUnit {
  return value === "fahrenheit" ? "fahrenheit" : "celsius";
}

export function sanitizeWindUnit(value: string | null): WindUnit {
  return value === "mph" ? "mph" : "kmh";
}
