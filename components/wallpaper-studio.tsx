"use client";

import { useEffect, useMemo, useState } from "react";
import { DISPLAY_CONFIG } from "@/lib/display-config";
import {
  DEFAULT_LOCATION,
  THEME_LABELS,
  type TemperatureUnit,
  type WallpaperTheme,
  type WindUnit,
} from "@/lib/wallpaper-config";

type SearchResult = {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type StravaStatus = {
  connected: boolean;
  source: "browser" | "environment" | "none";
  oauthConfigured: boolean;
  scope: string | null;
  athleteId: number | null;
  connectedAt: number | null;
};

export function WallpaperStudio() {
  const [label, setLabel] = useState(DEFAULT_LOCATION.label);
  const [latitude, setLatitude] = useState(String(DEFAULT_LOCATION.latitude));
  const [longitude, setLongitude] = useState(String(DEFAULT_LOCATION.longitude));
  const [theme, setTheme] = useState<WallpaperTheme>(DISPLAY_CONFIG.theme);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(DISPLAY_CONFIG.temperatureUnit);
  const [windUnit, setWindUnit] = useState<WindUnit>(DISPLAY_CONFIG.windUnit);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [origin, setOrigin] = useState("");
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [isDisconnectingStrava, setIsDisconnectingStrava] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);

  const wallpaperUrl = useMemo(() => {
    const params = new URLSearchParams({
      label,
      lat: latitude,
      lon: longitude,
      theme,
      size: DISPLAY_CONFIG.wallpaperSize,
      temp: temperatureUnit,
      wind: windUnit,
    });

    return `/api/wallpaper?${params.toString()}`;
  }, [label, latitude, longitude, theme, temperatureUnit, windUnit]);

  const absoluteWallpaperUrl = origin ? `${origin}${wallpaperUrl}` : wallpaperUrl;

  useEffect(() => {
    setOrigin(window.location.origin);

    const params = new URLSearchParams(window.location.search);
    const stravaResult = params.get("strava");

    if (stravaResult === "connected") {
      setMessage("Strava connected.");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (stravaResult === "missing_config") {
      setMessage("Strava client credentials are missing.");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (stravaResult === "denied") {
      setMessage("Strava connection was not approved.");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (stravaResult === "invalid_state" || stravaResult === "exchange_failed") {
      setMessage("Strava connection could not be completed.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    setPreviewError("");
  }, [wallpaperUrl]);

  useEffect(() => {
    void refreshStravaStatus();
  }, []);

  async function refreshStravaStatus() {
    try {
      const response = await fetch("/api/strava/status", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Strava status failed");
      }

      setStravaStatus((await response.json()) as StravaStatus);
      setPreviewNonce((nonce) => nonce + 1);
    } catch {
      setStravaStatus(null);
    }
  }

  async function searchLocation() {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        name: trimmedQuery,
        count: "5",
        language: "en",
        format: "json",
      });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);

      if (!response.ok) {
        throw new Error("Location search failed");
      }

      const data = (await response.json()) as { results?: SearchResult[] };
      setResults(data.results ?? []);
    } catch {
      setMessage("Location search is unavailable.");
    } finally {
      setIsSearching(false);
    }
  }

  function chooseResult(result: SearchResult) {
    setLabel([result.name, result.admin1, result.country].filter(Boolean).join(", "));
    setLatitude(String(result.latitude));
    setLongitude(String(result.longitude));
    setResults([]);
    setQuery("");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not available in this browser.");
      return;
    }

    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLabel("Current location");
        setLatitude(position.coords.latitude.toFixed(5));
        setLongitude(position.coords.longitude.toFixed(5));
      },
      () => {
        setMessage("Location permission was not granted.");
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
      },
    );
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${wallpaperUrl}`);
      setMessage("Wallpaper URL copied.");
    } catch {
      setMessage("Clipboard access is unavailable.");
    }
  }

  async function disconnectStrava() {
    setIsDisconnectingStrava(true);
    setMessage("");

    try {
      const response = await fetch("/api/strava/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Disconnect failed");
      }

      setMessage("Strava disconnected.");
      await refreshStravaStatus();
    } catch {
      setMessage("Strava could not be disconnected.");
    } finally {
      setIsDisconnectingStrava(false);
    }
  }

  function stravaStatusText() {
    if (!stravaStatus) {
      return "Checking";
    }

    if (stravaStatus.source === "browser") {
      return "Connected";
    }

    if (stravaStatus.source === "environment") {
      return "Environment tokens";
    }

    return "Not connected";
  }

  return (
    <main className="app-shell">
      <div className="workspace">
        <div className="control-column">
          <div className="brand-row">
            <div className="brand">
              <span className="brand-mark">Brevity</span>
              <h1>Daily wallpaper studio</h1>
            </div>
            <span className="status-pill">iPhone 15 PNG</span>
          </div>

          <div className="panel controls">
            <section className="section">
              <div className="section-heading">
                <span>Location</span>
                <button className="button warning" type="button" onClick={useCurrentLocation}>
                  Use current
                </button>
              </div>

              <div className="field">
                <label htmlFor="search">Search city</label>
                <div className="actions">
                  <input
                    id="search"
                    className="input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchLocation();
                      }
                    }}
                    placeholder="City or place"
                  />
                  <button className="button" type="button" onClick={() => void searchLocation()} disabled={isSearching}>
                    {isSearching ? "Searching" : "Search"}
                  </button>
                </div>
              </div>

              {results.length > 0 ? (
                <div className="search-results">
                  {results.map((result) => (
                    <button
                      className="result-button"
                      key={result.id}
                      type="button"
                      onClick={() => chooseResult(result)}
                    >
                      {[result.name, result.admin1, result.country].filter(Boolean).join(", ")}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="label">Wallpaper location label</label>
                <input id="label" className="input" value={label} onChange={(event) => setLabel(event.target.value)} />
              </div>

              <div className="grid-two">
                <div className="field">
                  <label htmlFor="latitude">Latitude</label>
                  <input
                    id="latitude"
                    className="input"
                    value={latitude}
                    inputMode="decimal"
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="longitude">Longitude</label>
                  <input
                    id="longitude"
                    className="input"
                    value={longitude}
                    inputMode="decimal"
                    onChange={(event) => setLongitude(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <span>Wallpaper</span>
              </div>

              <div className="field">
                <span className="label">Theme</span>
                <div className="segmented" role="group" aria-label="Theme">
                  {(Object.keys(THEME_LABELS) as WallpaperTheme[]).map((themeOption) => (
                    <button
                      className="segment"
                      key={themeOption}
                      type="button"
                      aria-pressed={theme === themeOption}
                      onClick={() => setTheme(themeOption)}
                    >
                      {THEME_LABELS[themeOption]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="temperature">Temperature</label>
                <select
                  id="temperature"
                  className="select"
                  value={temperatureUnit}
                  onChange={(event) => setTemperatureUnit(event.target.value as TemperatureUnit)}
                >
                  <option value="fahrenheit">Fahrenheit</option>
                  <option value="celsius">Celsius</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="wind">Wind speed</label>
                <select
                  id="wind"
                  className="select"
                  value={windUnit}
                  onChange={(event) => setWindUnit(event.target.value as WindUnit)}
                >
                  <option value="mph">mph</option>
                  <option value="kmh">km/h</option>
                </select>
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <span>Strava</span>
                <span className="status-inline">
                  <span className={stravaStatus?.connected ? "status-dot active" : "status-dot"} />
                  {stravaStatusText()}
                </span>
              </div>

              <div className="strava-box">
                <div className="strava-copy">
                  <span>{stravaStatus?.source === "browser" ? "Browser connection" : "Running data"}</span>
                  <p>
                    {stravaStatus?.source === "browser"
                      ? "OAuth is connected for previews and downloads in this browser."
                      : stravaStatus?.source === "environment"
                        ? "Using STRAVA_* environment values for the wallpaper."
                        : "Connect once to authorize running activity access."}
                  </p>
                </div>
                <div className="actions">
                  <a
                    className={stravaStatus?.oauthConfigured === false ? "button disabled" : "button primary"}
                    href={stravaStatus?.oauthConfigured === false ? undefined : "/api/strava/connect"}
                    aria-disabled={stravaStatus?.oauthConfigured === false}
                  >
                    {stravaStatus?.connected ? "Reconnect" : "Connect"}
                  </a>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void disconnectStrava()}
                    disabled={isDisconnectingStrava || stravaStatus?.source !== "browser"}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            </section>

            <section className="section">
              <div className="actions">
                <a className="button primary" href={wallpaperUrl} download="brevity-wallpaper.png">
                  Download PNG
                </a>
                <button className="button" type="button" onClick={() => void copyUrl()}>
                  Copy URL
                </button>
              </div>
              {message ? <div className="preview-error">{message}</div> : null}
              <p className="tiny-note">Shortcut URL: {absoluteWallpaperUrl}</p>
            </section>
          </div>
        </div>

        <div className="preview-column">
          <div className="preview-frame">
            <div className="preview-stack">
              <div className="phone-shadow" aria-label="Wallpaper preview">
                <div className="phone-screen">
                  <img
                    key={`${wallpaperUrl}:${previewNonce}`}
                    className="wallpaper-preview"
                    src={wallpaperUrl}
                    alt="Generated wallpaper preview"
                    onLoad={() => setPreviewError("")}
                    onError={() => setPreviewError("Wallpaper image could not be generated.")}
                  />
                </div>
              </div>
              <div className="preview-tools">
                <a className="button" href={wallpaperUrl} target="_blank" rel="noreferrer">
                  Open image
                </a>
                <button className="button" type="button" onClick={() => void copyUrl()}>
                  Copy Shortcut URL
                </button>
              </div>
              {previewError ? <div className="preview-error">{previewError}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
