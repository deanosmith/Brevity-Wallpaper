import { NextRequest, NextResponse } from "next/server";
import { STRAVA_CONNECTION_COOKIE } from "@/lib/strava";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ disconnected: true });
  response.cookies.set(STRAVA_CONNECTION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });

  return response;
}
