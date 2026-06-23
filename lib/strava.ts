export type StravaRunSummary = {
  lastWeekDistanceKm: number;
  lastFourWeeksDistanceKm: number;
  lastWeekMovingSeconds: number;
  lastFourWeeksMovingSeconds: number;
  lastWeekActivityCount: number;
  lastFourWeeksActivityCount: number;
};

export type StravaTokenSet = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
  athleteId?: number | null;
  connectedAt?: number | null;
};

type StravaActivity = {
  type?: string;
  sport_type?: string;
  distance?: number;
  moving_time?: number;
  start_date?: string;
};

type StravaTokenResponse = {
  access_token?: string;
  expires_at?: number;
  refresh_token?: string;
  scope?: string;
  athlete?: {
    id?: number;
  };
};

type StravaTokenCache = {
  accessToken: string | null;
  expiresAt: number | null;
  refreshToken: string | null;
};

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_PAGE_SIZE = 100;
const MAX_STRAVA_PAGES = 4;
const STRAVA_REQUEST_TIMEOUT_MS = 4500;
const DEFAULT_STRAVA_TIME_ZONE = "Europe/Copenhagen";
export const STRAVA_CONNECTION_COOKIE = "brevity_strava_connection";

let stravaTokenCache: StravaTokenCache = {
  accessToken: null,
  expiresAt: null,
  refreshToken: null,
};

export async function getStravaRunSummary(
  now = new Date(),
  tokenSet: StravaTokenSet | null = null,
): Promise<StravaRunSummary | null> {
  const accessToken = await getStravaAccessToken(now, tokenSet);

  if (!accessToken) {
    return null;
  }

  const periods = getStravaPeriods(now, process.env.STRAVA_TIME_ZONE?.trim() || DEFAULT_STRAVA_TIME_ZONE);
  const activities = await getStravaActivities(
    accessToken,
    periods.lastFourWeeksStartEpoch - 1,
    periods.currentWeekStartEpoch,
  );

  return summarizeRuns(
    activities,
    periods.lastWeekStartEpoch,
    periods.lastFourWeeksStartEpoch,
    periods.currentWeekStartEpoch,
  );
}

export function hasStravaOAuthConfig() {
  return Boolean(process.env.STRAVA_CLIENT_ID?.trim() && process.env.STRAVA_CLIENT_SECRET?.trim());
}

export function hasStravaEnvConnection() {
  return Boolean(
    process.env.STRAVA_ACCESS_TOKEN?.trim() ||
      (process.env.STRAVA_CLIENT_ID?.trim() &&
        process.env.STRAVA_CLIENT_SECRET?.trim() &&
        process.env.STRAVA_REFRESH_TOKEN?.trim()),
  );
}

export function encodeStravaConnection(tokenSet: StravaTokenSet) {
  return base64UrlEncode(
    JSON.stringify({
      accessToken: tokenSet.accessToken ?? null,
      refreshToken: tokenSet.refreshToken ?? null,
      expiresAt: tokenSet.expiresAt ?? null,
      scope: tokenSet.scope ?? null,
      athleteId: tokenSet.athleteId ?? null,
      connectedAt: tokenSet.connectedAt ?? Date.now(),
    }),
  );
}

export function decodeStravaConnection(value: string | undefined): StravaTokenSet | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(value)) as StravaTokenSet;

    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
      scope: typeof parsed.scope === "string" ? parsed.scope : null,
      athleteId: typeof parsed.athleteId === "number" ? parsed.athleteId : null,
      connectedAt: typeof parsed.connectedAt === "number" ? parsed.connectedAt : null,
    };
  } catch {
    return null;
  }
}

export async function exchangeStravaAuthorizationCode(code: string): Promise<StravaTokenSet> {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Strava client credentials are not configured.");
  }

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    signal: stravaRequestSignal(),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava authorization exchange failed: ${response.status}`);
  }

  const token = (await response.json()) as StravaTokenResponse;

  if (!token.access_token || !token.refresh_token) {
    throw new Error("Strava authorization did not return the expected tokens.");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at ?? null,
    scope: token.scope ?? null,
    athleteId: token.athlete?.id ?? null,
    connectedAt: Date.now(),
  };
}

async function getStravaAccessToken(now: Date, tokenSet: StravaTokenSet | null) {
  const nowEpoch = Math.floor(now.getTime() / 1000);

  if (tokenSet?.accessToken && (!tokenSet.expiresAt || tokenSet.expiresAt > nowEpoch + 300)) {
    return tokenSet.accessToken;
  }

  if (stravaTokenCache.accessToken && stravaTokenCache.expiresAt && stravaTokenCache.expiresAt > nowEpoch + 300) {
    return stravaTokenCache.accessToken;
  }

  const configuredAccessToken = process.env.STRAVA_ACCESS_TOKEN?.trim();
  const configuredAccessTokenExpiresAt = Number(process.env.STRAVA_ACCESS_TOKEN_EXPIRES_AT);

  if (configuredAccessToken && !Number.isFinite(configuredAccessTokenExpiresAt)) {
    return configuredAccessToken;
  }

  if (
    configuredAccessToken &&
    Number.isFinite(configuredAccessTokenExpiresAt) &&
    configuredAccessTokenExpiresAt > nowEpoch + 300
  ) {
    stravaTokenCache = {
      accessToken: configuredAccessToken,
      expiresAt: configuredAccessTokenExpiresAt,
      refreshToken: process.env.STRAVA_REFRESH_TOKEN?.trim() || stravaTokenCache.refreshToken,
    };

    return configuredAccessToken;
  }

  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  const refreshToken = tokenSet?.refreshToken || stravaTokenCache.refreshToken || process.env.STRAVA_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return configuredAccessToken || null;
  }

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    signal: stravaRequestSignal(),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${response.status}`);
  }

  const token = (await response.json()) as StravaTokenResponse;

  if (!token.access_token) {
    throw new Error("Strava token refresh did not return an access token.");
  }

  stravaTokenCache = {
    accessToken: token.access_token,
    expiresAt: token.expires_at ?? nowEpoch + 21_600,
    refreshToken: token.refresh_token ?? refreshToken,
  };

  if (tokenSet?.refreshToken === refreshToken) {
    tokenSet.accessToken = token.access_token;
    tokenSet.expiresAt = token.expires_at ?? nowEpoch + 21_600;
    tokenSet.refreshToken = token.refresh_token ?? refreshToken;
  }

  return token.access_token;
}

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;

  return atob(padded);
}

async function getStravaActivities(accessToken: string, after: number, before: number) {
  const activities: StravaActivity[] = [];
  const signal = stravaRequestSignal();

  for (let page = 1; page <= MAX_STRAVA_PAGES; page += 1) {
    const params = new URLSearchParams({
      after: String(after),
      before: String(before),
      page: String(page),
      per_page: String(STRAVA_PAGE_SIZE),
    });
    const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Strava activities request failed: ${response.status}`);
    }

    const pageActivities = (await response.json()) as StravaActivity[];
    activities.push(...pageActivities);

    if (pageActivities.length < STRAVA_PAGE_SIZE) {
      break;
    }
  }

  return activities;
}

function stravaRequestSignal() {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(STRAVA_REQUEST_TIMEOUT_MS);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), STRAVA_REQUEST_TIMEOUT_MS);

  return controller.signal;
}

function summarizeRuns(
  activities: StravaActivity[],
  lastWeekStartEpoch: number,
  lastFourWeeksStartEpoch: number,
  currentWeekStartEpoch: number,
): StravaRunSummary {
  const summary: StravaRunSummary = {
    lastWeekDistanceKm: 0,
    lastFourWeeksDistanceKm: 0,
    lastWeekMovingSeconds: 0,
    lastFourWeeksMovingSeconds: 0,
    lastWeekActivityCount: 0,
    lastFourWeeksActivityCount: 0,
  };

  activities.filter(isRunActivity).forEach((activity) => {
    const activityEpoch = parseActivityEpoch(activity.start_date);
    const distanceKm = Math.max(0, activity.distance ?? 0) / 1000;
    const movingSeconds = Math.max(0, activity.moving_time ?? 0);

    if (activityEpoch >= lastFourWeeksStartEpoch && activityEpoch < currentWeekStartEpoch) {
      summary.lastFourWeeksDistanceKm += distanceKm;
      summary.lastFourWeeksMovingSeconds += movingSeconds;
      summary.lastFourWeeksActivityCount += 1;
    }

    if (activityEpoch >= lastWeekStartEpoch && activityEpoch < currentWeekStartEpoch) {
      summary.lastWeekDistanceKm += distanceKm;
      summary.lastWeekMovingSeconds += movingSeconds;
      summary.lastWeekActivityCount += 1;
    }
  });

  return summary;
}

function isRunActivity(activity: StravaActivity) {
  const sportType = activity.sport_type?.toLowerCase() ?? "";
  const type = activity.type?.toLowerCase() ?? "";

  return sportType.includes("run") || type === "run";
}

function parseActivityEpoch(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.floor(timestamp / 1000);
}

function getStravaPeriods(now: Date, timeZone: string) {
  const parts = getZonedDateParts(now, timeZone);
  const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const currentWeekStartDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - mondayOffset));
  const lastWeekStartDate = shiftUtcDate(currentWeekStartDate, -7);
  const lastFourWeeksStartDate = shiftUtcDate(currentWeekStartDate, -28);

  return {
    currentWeekStartEpoch: zonedDateToEpoch(currentWeekStartDate, timeZone),
    lastWeekStartEpoch: zonedDateToEpoch(lastWeekStartDate, timeZone),
    lastFourWeeksStartEpoch: zonedDateToEpoch(lastFourWeeksStartDate, timeZone),
  };
}

function shiftUtcDate(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function zonedDateToEpoch(date: Date, timeZone: string) {
  return Math.floor(
    zonedDateTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), timeZone) / 1000,
  );
}

function getZonedDateParts(date: Date, timeZone: string) {
  try {
    return readDateParts(date, timeZone);
  } catch {
    return readDateParts(date, "UTC");
  }
}

function zonedDateTimeToUtc(year: number, month: number, day: number, timeZone: string) {
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);

  try {
    const parts = readDateTimeParts(new Date(utcGuess), timeZone);
    const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const offset = zonedAsUtc - utcGuess;

    return utcGuess - offset;
  } catch {
    return utcGuess;
  }
}

function readDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: readNumberPart(parts, "year"),
    month: readNumberPart(parts, "month"),
    day: readNumberPart(parts, "day"),
  };
}

function readDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    ...readDateParts(date, timeZone),
    hour: readNumberPart(parts, "hour"),
    minute: readNumberPart(parts, "minute"),
    second: readNumberPart(parts, "second"),
  };
}

function readNumberPart(parts: Intl.DateTimeFormatPart[], type: string) {
  const value = Number(parts.find((part) => part.type === type)?.value);

  if (!Number.isFinite(value)) {
    throw new Error(`Missing date part: ${type}`);
  }

  return value;
}
