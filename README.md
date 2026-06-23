# Brevity Wallpaper

Daily iPhone 15 wallpaper generator for sunrise, sunset, today's weather, and moon phase. The app is built as a Vercel-ready Next.js project and exposes a PNG route that can be used directly from iOS Shortcuts.

## What this first version displays

- Sunrise
- Sunset
- Weather today: combined high/low range, rain chance, wind max, UV max
- Moon phase for the generation time

Those display sections are currently hardcoded in `lib/display-config.ts`. The studio only asks for inputs that affect the generated wallpaper: location, theme, and units.

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
http://localhost:3000/api/wallpaper?label=Copenhagen&lat=55.6761&lon=12.5683&theme=night&size=iphone-15&temp=celsius&wind=kmh
```

## Vercel deployment

The repo includes `vercel.json`, `package.json`, and a Node engine requirement for the current Next.js runtime.

1. Push this repo to GitHub.
2. In Vercel, create a new project from the repo.
3. Keep Framework Preset as Next.js.
4. Deploy.

After deployment, the production image URL will look like:

```text
https://your-domain.vercel.app/api/wallpaper?label=Copenhagen&lat=55.6761&lon=12.5683&theme=night&size=iphone-15&temp=celsius&wind=kmh
```

## iOS Shortcut

Create a Shortcut with:

1. Get Contents of URL: paste the `/api/wallpaper?...` URL from the app.
2. Set Wallpaper: use the file returned by the previous action.

For a daily wallpaper, run that Shortcut from a personal automation.
