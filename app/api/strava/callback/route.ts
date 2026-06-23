import { NextRequest, NextResponse } from "next/server";
import {
  encodeStravaConnection,
  exchangeStravaAuthorizationCode,
  STRAVA_CONNECTION_COOKIE,
} from "@/lib/strava";

const STRAVA_STATE_COOKIE = "brevity_strava_state";
const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const storedState = request.cookies.get(STRAVA_STATE_COOKIE)?.value;
  const redirectUrl = new URL("/", request.nextUrl.origin);

  if (error) {
    redirectUrl.searchParams.set("strava", "denied");
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state || !storedState || state !== storedState) {
    redirectUrl.searchParams.set("strava", "invalid_state");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const tokenSet = await exchangeStravaAuthorizationCode(code);
    const response = NextResponse.redirect(new URL("/?strava=connected", request.nextUrl.origin));

    response.cookies.set(STRAVA_CONNECTION_COOKIE, encodeStravaConnection(tokenSet), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: SIX_MONTHS_SECONDS,
    });
    response.cookies.delete(STRAVA_STATE_COOKIE);

    return response;
  } catch {
    redirectUrl.searchParams.set("strava", "exchange_failed");
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(STRAVA_STATE_COOKIE);

    return response;
  }
}
