# StonesThrow

**The perfect holiday, a stone's throw away.**

An independent, AI-powered travel-agent and holiday-comparison web app. It guides
travellers (individuals, couples, families, groups) through a friendly planning
wizard, then searches, scores and compares the best-value, most suitable options —
flights, accommodation, activities, weather, alternative dates and alternative
destinations — and explains its recommendations in plain English.

Built as a **zero-build static web app** (HTML/CSS/vanilla JS) — deploys to
Cloudflare Pages with no build step.

## Run locally
Just open `index.html` via any static server, e.g.:
```bash
python3 -m http.server 8777
# then visit http://localhost:8777
```
(Opening the file directly with `file://` also works, but a server is recommended
so the JS modules load cleanly.)

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell, header/footer, font + script loading |
| `styles.css` | Design system (theme-aware light/dark, responsive, accessible) |
| `data.js` | Demo dataset **and** the modular provider adapters + config surface |
| `app.js` | Router, wizard, search orchestration, scoring engine, results, comparison, AI adviser, saved holidays, booking flow, admin |

## Demo mode
This build ships in **demo mode**. All prices are realistic, clearly-labelled
**indicative** sample figures — they are **not** live and nothing is bookable.
No personal or payment data is collected or stored.

## Connecting real suppliers (going live)
The app uses a modular **provider architecture**. Each supplier implements a
standard interface (`search()` / `get()`), so providers can be added, swapped or
removed independently. Integration points are marked in `data.js` with
`// >>> INTEGRATION POINT`.

Providers: `FlightProvider`, `AccommodationProvider`, `ActivityProvider`,
`WeatherProvider`, `CarHireProvider`, `AirportParkingProvider`, `TransferProvider`.

To go live:
1. Implement each provider against a legitimate API / affiliate feed.
2. Store credentials as **server-side** environment variables / secrets — never in
   client code (see the env-var names listed in the in-app **Admin** screen).
3. Return results in the standard shape, including a `meta` object
   (`source`, `live`, `checkedAt`).
4. Switch `STConfig.mode` to `'live'`. The UI then labels prices as live and shows
   when they were last checked.

This build does not fabricate live availability or booking capability.

## Accessibility
Keyboard-navigable, screen-reader labels, strong colour contrast, large touch
targets, adjustable text size, dark mode, meaning never conveyed by colour alone.
Traveller accessibility requirements also influence the search results themselves.

## Deploy (Cloudflare Pages)
Static site, no build. In Cloudflare Pages, connect this repo with:
- Framework preset: **None**
- Build command: *(empty)*
- Build output directory: **/** (repository root)

Thereafter, `git push` auto-deploys.
