import { DEFAULT_THEME, type TemperatureUnit, type WallpaperTheme, type WindUnit } from "@/lib/wallpaper-config";

type DisplayConfig = {
  wallpaperSize: "iphone-15";
  theme: WallpaperTheme;
  temperatureUnit: TemperatureUnit;
  windUnit: WindUnit;
  sections: {
    sunrise: boolean;
    sunset: boolean;
    weatherToday: {
      high: boolean;
      low: boolean;
      rainChance: boolean;
      windMax: boolean;
      uvMax: boolean;
    };
  };
};

export const DISPLAY_CONFIG: DisplayConfig = {
  wallpaperSize: "iphone-15",
  theme: DEFAULT_THEME,
  temperatureUnit: "celsius",
  windUnit: "kmh",
  sections: {
    sunrise: true,
    sunset: true,
    weatherToday: {
      high: true,
      low: true,
      rainChance: true,
      windMax: true,
      uvMax: true,
    },
  },
};
