import { NextRequest, NextResponse } from "next/server";
import {
  decodeStravaConnection,
  hasStravaEnvConnection,
  hasStravaOAuthConfig,
  STRAVA_CONNECTION_COOKIE,
} from "@/lib/strava";

export async function GET(request: NextRequest) {
  const cookieConnection = decodeStravaConnection(request.cookies.get(STRAVA_CONNECTION_COOKIE)?.value);
  const hasCookieConnection = Boolean(cookieConnection?.accessToken || cookieConnection?.refreshToken);
  const hasEnvConnection = hasStravaEnvConnection();

  return NextResponse.json({
    connected: hasCookieConnection || hasEnvConnection,
    source: hasCookieConnection ? "browser" : hasEnvConnection ? "environment" : "none",
    oauthConfigured: hasStravaOAuthConfig(),
    scope: cookieConnection?.scope ?? null,
    athleteId: cookieConnection?.athleteId ?? null,
    connectedAt: cookieConnection?.connectedAt ?? null,
  });
}
