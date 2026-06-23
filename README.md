# Brevity Wallpaper

Daily iPhone 15 wallpaper generator for sunrise, sunset, today's weather, and moon phase. The app is built as a Vercel-ready Next.js project and exposes a PNG route that can be used directly from iOS Shortcuts.

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

`Feel free to fork and customise`
