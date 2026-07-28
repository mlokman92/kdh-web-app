# KDH One Asset

Digital asset management for **Kejora Development Holding Sdn Bhd** — the corporate arm of
Lembaga Kemajuan Johor Tenggara (KEJORA), managing commercial, property and regional
development assets across South East Johor.

This repository holds an early **prototype for requirement gathering**. It runs entirely on
generated mock data — there is no backend, no database and no network dependency at runtime.

---

## What's here

| | |
|---|---|
| `src/` | **Web console** — Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui |
| `mobile/` | **Field mobile app** — Expo SDK 57 + React Native 0.86 + expo-router + NativeWind |

Both share one visual language: the **Ocean Breeze** theme from tweakcn.

---

## Running it

**Web console**

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

Sign in with the credentials already filled in on the login screen (`ceo@kdh.com.my` / `kdh2026`),
or use the one-click role shortcuts to jump straight in as a different persona.

**Mobile app**

```bash
cd mobile
npm install
npx expo start      # scan the QR with Expo Go, or press "a" / "i"
```

---

## Web console — six modules

1. **Executive Asset Dashboard** — portfolio KPIs, revenue vs target, condition mix, zone
   performance, an attention feed and an ESG panel. Period and zone filters re-slice everything.
2. **Unified Digital Asset Registry** — faceted master table, multi-step Add Asset, CSV import
   and export, and a **data-quality panel** that names the missing fields on incomplete records.
3. **GIS Asset Map** — pan, zoom, clustering, heatmap, layer toggles and a radius search tool.
4. **Maintenance & Work Orders** — kanban with drag-and-drop, live SLA countdowns, QR labels,
   a simulated field scan, planned maintenance, technician workload and vendor performance.
5. **Property, Lease & Revenue** — occupancy, rent roll, arrears ageing, renewal pipeline,
   tenant directory, and a **monetisation tab** deriving revenue opportunity from the data.
6. **AI Management Copilot** — a deterministic engine that answers questions by querying the
   store. Every answer carries citation chips and a "show working" note, and respects the
   signed-in role's zone scope.

## Mobile app — six screens

1. **Dashboard** — KPI tiles, portfolio health donut, zone strip, attention feed, pull-to-refresh.
2. **Asset Passport** (`/asset/[id]`) — generated hero banner, identity, financials, title and
   insurance, maintenance history, documents, lifecycle timeline, and a **scannable QR tag**.
3. **GIS Map** — the same South East Johor cartography, with pinch-zoom and pin clustering.
4. **QR Scan → Work Order** — scan an asset tag and raise a job on the spot.
5. **Maintenance Tasks** — urgency-grouped list with live SLA countdowns and an interactive checklist.
6. **AI Copilot Alerts** — proactive insights with recommendations, confidence and citations,
   plus an "Ask Copilot" sheet answered live from the store.

---

## Notes on the prototype

**Everything is mock data.** `src/data/mock.ts` (web) and `mobile/src/data/mock.ts` generate the
dataset through a seeded PRNG, so figures are identical on every load. Dates are derived as
offsets from "now", so the demo always looks current — leases expiring in 45 days, tickets raised
three hours ago — no matter when it is shown.

**Users can add data.** Assets, work orders, leases, tenants and payments can all be created in
the web console and persist to localStorage. "Reset Demo Data" restores the seed.

**The map draws its own cartography.** There is no Leaflet and no tile server. The coastline,
the six KEJORA operational zones and 21 real settlements are projected from coordinates in
`geo.ts` to inline SVG, so the map renders identically with no connectivity.

**The mobile QR scanner is simulated.** A live camera needs a permission prompt and a device
dependency mid-demo, so the scan flow is a simulation and labels itself "Demo mode". The QR tag
on the passport screen is a real, scannable code.

**shadcn/ui does not run on React Native.** It is Radix plus Tailwind for the DOM. The mobile app
uses NativeWind with a shadcn-shaped component kit (`Card`, `Badge`, `Button` with
`variant`/`size`, `Progress`, `StatusBadge`), and the Ocean Breeze tokens converted from
`oklch()` to sRGB — React Native cannot parse `oklch`. The conversion is stored as `R G B`
triplets so Tailwind alpha modifiers (`bg-primary/10`) still work.

**Three theme tokens were adjusted for legibility.** Ocean Breeze ships white on its primary
green, which measures 2.28:1 in light mode — below AA, and it covered the whole login screen and
every default button. `--primary-foreground` and `--sidebar-primary-foreground` are now dark ink
on the same green (7.86:1), leaving the brand colour untouched. The theme also reused its
light-mode `--muted-foreground` in dark mode (3.03:1); it now matches the dark
secondary-foreground (5.71:1). Each change is commented in `src/index.css`.

**Outstanding review findings** are listed in `REVIEW-FINDINGS.json` — all 5 blockers are fixed;
12 major and 13 minor items remain.
