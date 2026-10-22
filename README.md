# TekPath

TekPath is a crowdsourced campus navigation app for students with mobility needs at Kwame Nkrumah University of Science and Technology (KNUST), Kumasi. It finds step-free routes, shows wheelchair ramps and lifts, and lets students report when a lift or ramp is broken. Outdoor pins sit on an OpenStreetMap of campus. Indoor guidance is landmark by landmark inside one fully mapped pilot building, the Engineering Lecture Block.

Coordinates in the seed are **approximate demo positions** around the campus centre (6.6745 N, 1.5716 W). They are not a survey.

## Run it locally

You need Node.js 22.13 or newer, the [Supabase CLI](https://supabase.com/docs/guides/cli), and Docker. This app is Expo SDK 57, which does not support Node.js 20.

```bash
npm install
cp .env.example .env
supabase start
```

`supabase start` prints `API_URL` and `ANON_KEY`. Put those in `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
```

The anon key is public by design. Do not put the service role key in `.env` or in the app. `.env` is gitignored.

Apply a clean database (migration + seed):

```bash
supabase db reset
npm test
npx expo start --port 43123
```

Press `w` for the browser, or scan the QR code with Expo Go. The web app is also `npm run web`. Web is a client-side bundle (`web.output` is `single` in `app.json`) so camera, map, and auth run in the browser without a server render.

Local demo account (created by the seed):

- Email: `demo@tekpath.app`
- Password: `TekpathDemo2026` (local stack only; do not reuse it on a hosted project)
- Magic links and sign-up mail land in Mailpit at http://127.0.0.1:54324

If `supabase start` hangs on “Initialising schema” with database connection timeouts, Docker’s legacy iptables `FORWARD` policy may be `DROP`, which blocks container-to-container traffic. On this kind of VM, `sudo iptables-legacy -P FORWARD ACCEPT` unblocks it. Realtime is set to IPv4 in `supabase/config.toml` for the same local Docker network.

## Link a hosted Supabase project

Apply the SQL files in `supabase/migrations` **in filename order** on an empty project. Each file is one migration. Keep `supabase/seed.sql` separate; it is not a migration.

1. Create a project at [supabase.com](https://supabase.com).
2. Run `20261021220549_tekpath_schema.sql`, then `20261021231633_privacy_profile_needs.sql`. The first file enables PostGIS and pgcrypto in the `extensions` schema and creates the `report-photos` storage bucket and its policies.
3. Create the demo account with the Auth admin API (or the dashboard), not by inserting into `auth.users`. Hosted GoTrue does not treat a raw SQL insert as a reliable sign-in:

```bash
curl -X POST "$EXPO_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@tekpath.app","password":"CHOOSE_A_NEW_PASSWORD","email_confirm":true,"user_metadata":{"display_name":"Ama Mensah"}}'
```

The new-user trigger creates `profiles` and an empty `profile_private` row. Use the service role only for this call. Do not put it in the app.
4. Run `supabase/seed.sql` in the SQL editor after that user exists if you want the KNUST graph. The auth insert is skipped when it cannot write `auth.users` or when the email already exists. The Administration Block “broken” report is attached to `demo@tekpath.app` only when that account is already there.
5. In Authentication → URL configuration, set the site URL and add redirect URLs before magic links or email confirmation will open the app. See the phone section below.
6. Copy the project URL and the anon key, or the publishable key, into `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Restart Expo after changing them.

## Test on your phone with Expo Go

The app is Expo SDK 57 (`expo` 57.x, React Native 0.86). Open it in Expo Go for SDK 57. Expo Go for SDK 58 will not load this project.

The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env`. A publishable key (`sb_publishable_...`) works in the anon key variable. Point both at the hosted project. A phone cannot open `127.0.0.1` on your computer.

```bash
npx expo start --tunnel --port 43123
```

`--tunnel` is the reliable path when the phone is not on the same Wi-Fi as the computer. Scan the QR code with Expo Go. The project stays inside Expo Go: camera, sensors, image picker, and a web view map. There is no custom native code and no Bluetooth.

Auth redirect URLs, in the hosted dashboard under Authentication → URL configuration:

- Site URL: `tekpath://` is enough for the app scheme. Add your Expo web origin too if you test in a browser.
- Additional redirect URLs: `tekpath://**`, `exp://**`, and `https://*.exp.direct/**` (the tunnel host). Magic links use `Linking.createURL('/')`, which is an `exp://` URL in Expo Go and `tekpath://` in a built app. If the link’s URL is not on this list, Supabase sends the person to the site URL instead of back into Expo Go.
- Email confirmation: hosted projects often require it. Password sign-up then waits for the email link. The admin API call above sets `email_confirm: true`, so the demo account can sign in with a password immediately. You can also turn off “Confirm email” for the hackathon.

The barometer floor estimate works on a physical phone. Web and phones without a barometer still show the floor you calibrated at the entrance, and the “I’m one floor up / down” buttons correct it.

## Print QR codes

Every seeded node has a unique `qr_code` (for example `ELB-RAMP-G`, `ELB-LT201`).

- In the app, open **Account → Print QR codes**, or Contribute → Print checkpoint QR codes. On web, use the browser print dialog.
- From the repo, with the database running: `npm run qr`. That writes `qr-print/index.html` (gitignored). Open it and print. Stick each card at the landmark it names.

Scanning a code in the app sets that node as the exact start. The same codes can be typed in if the camera is unavailable.

## Demo script for judges

Start from a fresh `supabase db reset` so both lifts are working and the Administration Block ramp is the only broken pin.

1. Open the map. Pins use a letter (R ramp, L lift, T toilet, P parking, E entrance) plus the words Working, Broken, or Unknown. The Administration Block ramp is already Broken, from a seeded report. Unity Hall’s lift is Unknown.
2. Search for `201`. Choose **Lecture Theatre 201**.
3. Pick the start **ELB forecourt** (or scan `ELB-RAMP-G`, which also calibrates the ground floor).
4. The route uses **Lift A** on the way to level 2. Start step-by-step guidance. Each screen is one landmark, with an “I’m here — next” button. On a phone, taking Lift A and rising about one floor (3.6 m, ~0.12 hPa per metre) auto-advances that lift step.
5. Sign in as `demo@tekpath.app`. Open **Lift A**, mark it **Broken**, add a note, and submit. The map updates live.
6. Search for Lecture Theatre 201 again. The new route uses **Lift B**, including the line “Go through the ramp door; Lift B is on your right.”
7. Mark **Lift B** broken as well. The next route says there is no step-free route and names both lifts. Stairs stay in the graph and are never offered.
8. A route to the ground-floor accessible toilet still succeeds, because it does not need a lift.

`npm test` checks the same cases in Postgres: Lift A while both work, Lift B after Lift A is reported broken, an honest failure naming both lifts, and the seeded broken Administration Block ramp.

## Artwork

Onboarding, the no-route state, and the saved-report moment use illustrations from [unDraw](https://undraw.co) by Katerina Limpitsouni. The [unDraw license](https://undraw.co/license) allows commercial use and recolouring, and it does not require attribution. The files in the app are recolored to TekPath teal (`#0F6E56`) and terracotta (`#C46A3A`). The current unDraw catalog has no wheelchair, crutches, or white-cane scene, so those screens use unDraw’s map, walking, and navigation drawings instead of custom figures.

Map pins, floor-plan marks, and the wordmark use [Lucide](https://lucide.dev) icons (ISC).

## Architecture

```
Expo Router app (Expo SDK 57, Expo Go + web)
  map (Leaflet + OSM tiles) · search · reports · QR · guidance
        |  supabase-js, anon key, RLS
        v
Supabase
  PostGIS tables · plpgsql Dijkstra · report trigger · Realtime · Storage · Auth
```

- **Graph.** `buildings`, `floors`, `nodes`, and `edges`. Nodes are entrances, ramps, lifts, corridors, rooms, toilets, junctions, and outdoor points. Edges are corridors, ramps, lifts, stairs, or outdoor paths, with instruction text in both directions.
- **Status.** `features` are ramps, lifts, accessible toilets, parking, and step-free entrances. A report insert runs a trigger that sets the feature’s current status to the latest report. Routing reads that status. It skips stairs and any lift or ramp edge whose feature is `broken`.
- **Routing.** `find_step_free_route(from, to)` is a `STABLE` SQL function. pgRouting is not in the default Supabase Postgres image, so Dijkstra runs in plpgsql over an in-memory jsonb graph. If every step-free path is blocked, the function names the broken lifts or ramps that sit on the otherwise shortest paths. `nearest_start_node(lat, lng)` snaps GPS to a node only when it is within 800 metres of campus.
- **Security.** New public tables get explicit grants in the same migration: `anon` can select; `authenticated` and `service_role` can select, insert, update, and delete. RLS is on. Campus data is public to read. Inserts for reports and crowdsourced points require a signed-in user and stamp `user_id` / `created_by`. Users update or delete only their own rows. `profiles.display_name` is public. `mobility_needs` lives in `profile_private` and the policy allows only that user’s row, so anon and other accounts get nothing back. Report notes and photos are public through `report_feed`, which includes the display name and leaves out `user_id`. `anon` and `authenticated` cannot select `reports.user_id` or `auth.users`. Report photos go in the public `report-photos` bucket, under a folder named with the user’s id.
- **Indoor position.** There are no beacons. A QR scan or a picked entrance stores a barometer baseline. Later pressure change estimates the floor (`delta hPa / 0.12` metres, divided by the floor height on that floor, default 3.6 m). The detected floor is always visible and can be corrected. Guidance is one landmark per screen.

## Tests

```bash
npm test
```

`tests/routing.test.mjs` and `tests/privacy.test.mjs` each run a SQL file inside a transaction and roll it back, so the seed is unchanged. Postgres must be up (`supabase start`). Override the connection with `DATABASE_URL` if it is not `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. The privacy test checks that anon and a second user cannot read someone else’s mobility needs, that the owner can, and that those roles cannot read `auth.users` or `reports.user_id`.

## Known limits

- One pilot building is mapped indoors. Outdoor paths are short demo connections, not the real KNUST footpath network.
- The barometer estimates floor changes only. It does not place you along a corridor. Web has no barometer.
- Report notes and photos are public, with the author’s display name. Mobility needs are not. The photo URL is a public storage link.
- OSM tiles and the Leaflet script load from the network (`tile.openstreetmap.org`, `unpkg.com`).
- Seeded feature status changes by adding a newer report. `supabase db reset` restores the demo.
