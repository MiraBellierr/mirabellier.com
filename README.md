# Mirabellier.com
![](https://i.pinimg.com/1200x/91/0f/e0/910fe0a70293589ee9834d7f5bdf1645.jpg)

This is the frontend for my little corner of the web.

It is a cozy React + TypeScript app where I share blog posts, shrines, anime updates, question-of-the-day prompts, a draggable guestbook board, a character-card Arena, a short-video feed, and other soft internet things.

## Hiya!!

If you are peeking around this repo, welcome welcome. This part is the one people actually see: pages, styling, route flow, cute details, and all the UI bits that make the site feel personal.

## What this frontend does

- Renders all public and logged-in pages for `mirabellier.com`
- Calls the backend API for blog, profile, guestbook, anime, quote, question, Arena, TCG, Pixies, fan-art, and Twitch data
- Handles auth-related routes like login and the Discord OAuth callback flow
- Holds a live Socket.IO connection for Arena fight playback, TCG matches, and the anime feed
- Verifies humans with a Cloudflare Turnstile widget before sensitive actions
- Includes rich blog editing with Tiptap
- Injects route-specific SEO `<head>` tags at build time so links unfurl nicely
- Ships the production static build for deployment to the VPS

## What lives here

- Home / about / projects pages with a handmade personal style
- Blog list, blog post, and blog editor screens
- Character shrine routes (Kanna, Rossina, and dynamic `:slug` entries) + shrine hub
- Guestbook board and guestbook signing page
- Question of the Day page plus archive pages
- Quotes page and anime page
- Fan-art search page
- Twitch page (live status, stream predictions, "notify me when live" web push)
- Pixies short-video feed + upload page
- Arena pages: home, fight, shop, inventory, collection, mint, market, trading, skill tree, leaderboard, hall of fame, inbox, archive
- TCG pages (deck building + live match) under `/arena/tcg`
- Admin pages for question-of-the-day, shrines, users, Twitch, Pixies, and Arena updates/metrics
- Privacy and Terms pages
- Shared layout pieces, context providers (auth, cursor, toast, confirm, websocket), hooks, and reusable components

## The stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS
- React Router 7
- Tiptap 3 (+ lowlight syntax highlighting) for the blog editor
- Radix UI + Floating UI for menus/popovers
- `socket.io-client` for real-time features
- Cloudflare Turnstile for human verification

## Running it locally

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Copy `.env.example` to `.env`, then set values for your environment.

```env
VITE_API_BASE=https://api.mirabellier.com/v1
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
WEBSITE_BASE=https://mirabellier.com
```

- For local backend development, `VITE_API_BASE` is usually `http://localhost:3000/v1`.
- `VITE_SITE_ORIGIN` is optional; it overrides the origin used for canonical/share links (defaults to the real domain in a production build, the dev-server origin otherwise).
- Only `VITE_`-prefixed vars reach the browser bundle. `WEBSITE_BASE` is used by sitemap and feed generation.

### 3. Start the frontend

```bash
npm run dev
```

The app runs at `http://localhost:5173` by default. The dev server proxies `/ws` to `http://localhost:3000` so the Socket.IO connection works against a local backend.

This frontend expects a working API at `VITE_API_BASE`. Backend setup lives in [mirabellier-backend/README.md](./mirabellier-backend/README.md).

## Useful scripts

- `npm run dev` - start Vite dev server
- `npm test` - run the frontend unit tests (`node --test` over `src/lib/**/*.test.ts`)
- `npm run build` - run the TypeScript project build + production Vite build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm run backend:dev` - run the backend app entry from the repo root
- `npm run generate:sitemap` - regenerate sitemap data
- `npm run indexnow:submit-all` - submit all sitemap URLs to IndexNow

## Deployment

`.github/workflows/deploy.yml` is the real path: on every push to `main` (and on pull requests) CI runs two jobs in parallel — lint + build the frontend, and the frontend `node --test` suite. On a push to `main`, once both are green, it deploys to the VPS as an atomic release. (`mirabellier-backend/` is a separate repo with its own CI/CD workflow.) The build is SCPed into `/var/www/mirabellier.com/releases/<commit-sha>/` (`.well-known` included), and only once the upload is verified is `/var/www/mirabellier.com/current` — the symlink nginx serves — flipped to the new release with a single `rename(2)`. A failed upload leaves `current` on the previous good release; the five most recent releases are kept for rollback. The `VITE_TURNSTILE_SITE_KEY` used for the production build is set in the workflow env.

> First deploy after adopting this: the workflow removes the old real `current/` directory once and replaces it with the symlink. nginx must be able to follow it (`disable_symlinks` off, which is the default).

## Main route map

Arena routes are also reachable under the short `/ar/...` prefix (e.g. `/ar/fight`). A few legacy names (`/poloroid`, `/loops`, `/reels`, and their `/admin/*` variants) redirect to the current Pixies routes.

- `/` - home page (`/home` redirects here)
- `/about` - about page
- `/projects` - projects page
- `/anime` - anime page
- `/fanart` - fan-art search page
- `/twitch` - Twitch predictions + notifications page
- `/arena` - Arena home
- `/arena/fight` - Arena fight page
- `/arena/shop` - Arena shop page
- `/arena/inventory` - equipment / consumables inventory
- `/arena/collection` - card collection page
- `/arena/mint` - card minting page
- `/arena/market` - player card marketplace
- `/arena/trade` - player-to-player trading
- `/arena/skill-tree` - Arena skill tree page
- `/arena/leaderboard` - Arena leaderboard page
- `/arena/hall-of-fame` - Arena hall of fame
- `/arena/inbox` - Arena notifications inbox
- `/arena/archive` - Arena compensation / update archive
- `/arena/tcg/decks` - TCG deck building (`/arena/tcg` redirects here)
- `/arena/tcg/match` - live TCG match
- `/shrine` - shrine hub
- `/shrine/kanna`, `/shrine/rossina` - dedicated shrine pages
- `/shrine/:slug` - dynamic shrine entry page
- `/quotes` - quotes page
- `/question-of-the-day` - question of the day page
- `/question-of-the-day/archive` - question archive list
- `/question-of-the-day/archive/:recordedDate` - archive day detail
- `/guestbook` - draggable guestbook board
- `/guestbook/sign` - guestbook signing page
- `/pixies` - short-video feed (`/pixies/:videoId` opens a specific video)
- `/pixies/upload` - Pixie upload page
- `/blog` - blog list
- `/blog/:slug` - single blog post
- `/blog/edit` - blog editor page
- `/admin` - admin home
- `/admin/question-of-the-day` - admin question management
- `/admin/shrines`, `/admin/shrines/preview` - admin shrine management + preview
- `/admin/users` - admin user management
- `/admin/twitch` - admin Twitch channel management
- `/admin/pixies` - admin Pixies / social-import management
- `/admin/arena-updates` - Arena update posts
- `/admin/arena-metrics` - Arena metrics dashboard
- `/login` - login page
- `/auth/callback` - Discord OAuth callback page
- `/settings` - account settings
- `/profile` - your profile page when logged in
- `/profile/:username` - public profile page by username
- `/privacy`, `/terms` - policy pages

## If something feels broken

- Check `.env` first, especially `VITE_API_BASE` and `VITE_TURNSTILE_SITE_KEY`
- Make sure the backend is actually running and reachable
- If real-time features (Arena fights, TCG, anime feed) hang, check the `/ws` proxy target and that the backend Socket.IO server is up
- If the Turnstile widget never renders, verify `VITE_TURNSTILE_SITE_KEY` matches the backend's secret key pair
- If auth fails, check backend Discord/OAuth settings before changing frontend logic
- If routes load blank after deploy, rebuild and verify static asset paths
- If styling looks strange, restart `npm run dev` so Vite can rebuild cleanly

## Why this repo exists

This frontend is where I try to make code feel warm.  
Cute on the surface, practical underneath, and comfy to keep growing over time.
