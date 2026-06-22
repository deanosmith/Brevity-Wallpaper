# Brevity Wallpaper

Daily iPhone 15 wallpaper generator for sunrise, sunset, today's weather, and an NKJV verse of the day. The app is built as a Vercel-ready Next.js project and exposes a PNG route that can be used directly from iOS Shortcuts.

## What this first version displays

- Sunrise
- Sunset
- Weather today: high, low, rain chance, wind max, UV max
- NKJV verse of the day

Those display sections are currently hardcoded in `lib/display-config.ts`. The studio only asks for inputs that affect the generated wallpaper: location, theme, units, and optional NKJV verse text/reference.

## Image size

The default output is for a normal iPhone 15:

```text
1179 x 2556
```

## Running locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

The generated image route is:

```text
http://localhost:3000/api/wallpaper?label=New%20York&lat=40.7128&lon=-74.006&theme=dawn&size=iphone-15&temp=fahrenheit&wind=mph
```

## NKJV verse input

NKJV text is not bundled as a verse corpus. For this first iteration you can use either:

- The studio's NKJV verse fields, which encode the verse into the image URL.
- Vercel environment variables:

```text
NKJV_VERSE_TEXT=Your verse text
NKJV_VERSE_REFERENCE=Your reference
```

If no verse is provided, the app uses a short NKJV fallback.

## Vercel deployment

The repo includes `vercel.json`, `package.json`, and a Node engine requirement for the current Next.js runtime.

1. Push this repo to GitHub.
2. In Vercel, create a new project from the repo.
3. Keep Framework Preset as Next.js.
4. Add `NKJV_VERSE_TEXT` and `NKJV_VERSE_REFERENCE` if you want a fixed server-side verse.
5. Deploy.

After deployment, the production image URL will look like:

```text
https://your-domain.vercel.app/api/wallpaper?label=New%20York&lat=40.7128&lon=-74.006&theme=dawn&size=iphone-15&temp=fahrenheit&wind=mph
```

## iOS Shortcut

Create a Shortcut with:

1. Get Contents of URL: paste the `/api/wallpaper?...` URL from the app.
2. Set Wallpaper: use the file returned by the previous action.

For a daily wallpaper, run that Shortcut from a personal automation.
