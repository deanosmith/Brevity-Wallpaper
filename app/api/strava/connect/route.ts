import { NextRequest, NextResponse } from "next/server";
import { hasStravaOAuthConfig } from "@/lib/strava";

const STRAVA_STATE_COOKIE = "brevity_strava_state";
const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";

export async function GET(request: NextRequest) {
  if (!hasStravaOAuthConfig()) {
    return NextResponse.redirect(new URL("/?strava=missing_config", request.nextUrl.origin));
  }

  const state = crypto.randomUUID();
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI?.trim() ||
    new URL("/api/strava/callback", request.nextUrl.origin).toString();
  const authorizeUrl = new URL(STRAVA_AUTHORIZE_URL);

  authorizeUrl.search = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID?.trim() ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "force",
    scope: process.env.STRAVA_SCOPE?.trim() || "activity:read_all",
    state,
  }).toString();

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STRAVA_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
