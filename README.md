# Brevity Wallpaper

A daily wallpaper brief containing various glance-able metrics: sunrise, sunset, today's weather, and moon phases. The app is built as a Vercel-ready Next.js project and exposes a PNG route that can be used directly from iOS Shortcuts.

## iOS Shortcut

Create a Shortcut with:

1. Get Contents of URL: paste the [URL from the app](https://brevity-ios.vercel.app/api/wallpaper?label=Copenhagen&lat=55.6761&lon=12.5683&theme=night&size=iphone-15&temp=celsius&wind=kmh).
2. Set Wallpaper: use the file returned by the previous action.

For a daily wallpaper, run that Shortcut from a personal automation.

## iPhone 15 Demo

<img width="299" height="639" alt="image" src="https://github.com/user-attachments/assets/3a99047d-5b10-41bc-a204-cce31a31e9ca" />
<img width="299" height="639" alt="Screenshot 2026-06-23 at 10 51 49 AM" src="https://github.com/user-attachments/assets/c594cc44-a38a-435a-9f74-e5b169f9510c" />

## Proof Of Concept Metrics

- Weather today: combined high/low range, rain chance, wind max, UV max
- Sunrise
- Sunset
- Moon phase for the generation time
- Strava running distance for the last complete week and last four complete weeks

## Strava Environment Variables

For local development, place the Strava values in `.env`. On Vercel, add the same keys under Environment Variables.

Required for the Connect Strava button:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

Optional server-side tokens for the wallpaper route and iOS Shortcuts:

- `STRAVA_REFRESH_TOKEN`
- `STRAVA_ACCESS_TOKEN`
- `STRAVA_ACCESS_TOKEN_EXPIRES_AT`

Optional:

- `STRAVA_REDIRECT_URI`
- `STRAVA_SCOPE`
- `STRAVA_TIME_ZONE`

The app requests `activity:read_all` by default so private runs can be included. Set `STRAVA_SCOPE=activity:read` if you only want activities visible to Everyone and Followers. `STRAVA_ACCESS_TOKEN_EXPIRES_AT` is optional; if it is absent, the app will try the access token as-is.
Strava can rotate refresh tokens after a refresh, so for long-running server-side use, keep `STRAVA_REFRESH_TOKEN` current in Vercel.
In the Strava developer settings, set the authorization callback domain to your deployed host. Localhost and `127.0.0.1` are allowed for local development.

`Feel free to fork and customise`
