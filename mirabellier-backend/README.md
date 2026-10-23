# Mirabellier.com

![](https://i.pinimg.com/736x/b5/23/39/b523395fe0601e970ff89626c0f76aa8.jpg)

This is the backend for my little corner of the web.

It is a cozy-but-serious Express app that handles auth, data, uploads, share previews, real-time fights, and all the behind-the-scenes logic that keeps the frontend feeling smooth.

## Hiya!!

The frontend gets the sparkles, but this is the quiet engine room. It stores the content, protects auth sessions, syncs live-ish data, and makes sure the cute pages are backed by real behavior.

## What this backend does

- Serves blog posts, tags, comments, and likes
- Handles Discord OAuth login and httpOnly session cookies
- Mirrors Discord avatars/banners onto this origin so profiles keep working when Discord URLs expire
- Stores and updates public profile data, plus follows between users
- Powers the guestbook board with synced note positions
- Runs the Arena game API: profile, collection, card draws and packs, shop, equipment, crafting/enhancing, skill tree, marketplace, player-to-player trading, leaderboard, and Hall of Fame
- Runs a turn-based TCG (queue, solo, live games) over WebSockets
- Streams real-time Arena fight playback and the anime feed over Socket.IO
- Runs Question of the Day APIs (current, answers, archive, admin queue)
- Runs the Pixies short-video feed: browsing, likes, comments, notifications, and admin import from TikTok / Instagram / YouTube via `yt-dlp`
- Aggregates fan-art search across Safebooru, Gelbooru, Danbooru, and Pixiv
- Tracks Twitch channels: live status, stream predictions, accuracy stats, and "notify me when live" web-push
- Serves shrine admin/content APIs and shrine SEO/share pages
- Serves anime and quote SEO/share pages + embed images
- Syncs Honkai: Star Rail characters, teams, and images from prydwen.gg daily (`data/hsr/`, `images/hsr/`) and serves the team index behind the site's team planner
- Stores quote snapshots and MyAnimeList currently-watching snapshots
- Handles image uploads and optimization
- Collects real-user Core Web Vitals + uncaught client errors from the SPA (`POST /telemetry/vitals`, `POST /telemetry/errors`; 30-day retention)
- Generates sitemap data and supports IndexNow submission
- Publishes syndication feeds - blog (`/feed.xml` Atom + `/feed.json` JSON Feed) and Question of the Day (`/feed/questions.xml` + `/feed/questions.json`) - regenerated on every relevant content change
- Serves the hand-edited `/now` page content (`GET /now` public, `PUT /now` owner-only)
- Verifies humans with Cloudflare Turnstile before sensitive actions
- Hardens requests with Helmet, CORS allow-listing, and per-IP rate limiting

## The stack

- Node.js + Express 5
- SQLite with `better-sqlite3`
- Passport Discord + `express-session`
- Socket.IO for real-time fights, TCG games, and the anime feed
- Multer + Sharp for uploads and image optimization
- Helmet, `express-rate-limit`, `compression`
- `web-push` (VAPID) for Twitch live notifications
- Playwright / `yt-dlp` / `ffmpeg` for social-video import
- Cloudflare Turnstile for human verification

## API base notes

Frontend usually calls this API at `/v1` (example: `http://localhost:3000/v1`).

This backend also accepts unprefixed routes because it normalizes `/v1/*` internally. So these are equivalent:

- `/v1/posts`
- `/posts`

## Running it locally

### 1. Install dependencies

```bash
cd mirabellier-backend
npm install
```

### 2. Create `mirabellier-backend/.env`

Copy `.env.example` and fill in your values. `.env.example` is the source of truth and documents every optional variable inline. The essentials:

```env
PORT=3000
DB_FILE=./database.sqlite3
SESSION_SECRET=your-very-secret-value
OWNER_DISCORD_IDS=your_discord_user_id
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback
FRONTEND_URL=http://localhost:5173
MAL_CLIENT_ID=your_myanimelist_client_id
MAL_USERNAME=your_myanimelist_username
WEBSITE_BASE=https://mirabellier.com
INDEXNOW_KEY=your-indexnow-key
TURNSTILE_SECRET_KEY=your_turnstile_secret_key
```

Other groups documented in `.env.example`:

- Session cookie options (`SESSION_COOKIE_NAME`, `SESSION_COOKIE_MAX_AGE_SECONDS`, `SESSION_COOKIE_SECURE`)
- Local-dev toggles: `TURNSTILE_DEV_BYPASS`, `ALLOW_DEV_ORIGINS` (both must stay `false` anywhere internet-facing)
- Proxy / abuse controls: `TRUST_PROXY_HOPS`, `RATE_LIMIT_GLOBAL_PER_MIN`, `RATE_LIMIT_WRITE_PER_MIN`
- Twitch: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` for web push
- Fan-art providers: optional Gelbooru / Danbooru / Pixiv credentials
- Social import: `TIKTOK_TTWID`, cookie-file paths for TikTok / Instagram / YouTube, `YTDLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`
- QOTD Discord webhook, MAL refresh interval, quote schedule, Arena day offset, IndexNow toggles

### Arena character catalog

Arena card draws use the favorites-ranked local file at
`data/mal-characters.json`. Refresh it by scraping MyAnimeList:

```bash
cd mirabellier-backend
npm run scrape:mal:characters
```

The scraper checkpoints every 50 characters and resumes automatically. You can
override the catalog path if needed:

```env
MAL_CHARACTERS_FILE=./data/mal-characters.json
```

Card rarity follows the character's position in that ranked file: top 1% UR,
next 4% SSR, next 10% SR, next 25% R, and the remaining 60% C.

### Honkai: Star Rail data (prydwen.gg)

`lib/hsr-sync.js` mirrors the Honkai: Star Rail roster and the global endgame
team usage table from [prydwen.gg](https://www.prydwen.gg/star-rail/characters)
into JSON plus local images:

```bash
cd mirabellier-backend
npm run sync:hsr          # incremental: only characters whose listing changed
npm run sync:hsr:full     # re-fetch every character page
node scripts/sync-hsr.cjs --slug=acheron   # one character
```

prydwen.gg is behind Cloudflare's managed challenge, so the sync drives a
headless Chromium through Playwright (the backend already depended on it for
social video import — run `npx playwright install chromium` if the browser is
missing). The site is a Next.js app, and all page data lives in its
`self.__next_f.push` RSC payload; `lib/hsr-prydwen.js` parses that, including
the listing JSON and the `analytics.{moc,pf,as,aa}Teams` arrays the character
pages carry.

Every character page carries the same usage table sliced so that character is
always one of the four slots, which means a team appears on each of its
members' pages with identical rank and app rate. `buildTeamIndex` reads the
union, dedupes by the sorted member set, drops rows that are not a full
four-character lineup, and sorts by prydwen's rank — 1,952 teams for Memory of
Chaos, ~1,800-1,900 for each of the other modes.

Outputs:

- `data/hsr/characters.json` - the roster: name, rarity, element, path, role, release state, tier ratings, and image URLs (remote + local)
- `data/hsr/team-index.json` - every distinct team per mode, ranked, with its phase metadata
- `data/hsr/characters/<slug>.json` - per-character detail (the sync's incremental unit; also the source the index is rebuilt from)
- `data/hsr/.meta.json` - roster hashes, per-character timestamps, and failures
- `images/hsr/characters/*`, `images/hsr/icons/*` - mirrored card/icon/full art and element/path icons

A run fetches the listing, hashes each entry, and only loads detail pages whose
hash moved (plus anything that previously failed) — usually zero page loads,
after which the team index is rebuilt from the cached detail files. Every
`HSR_SYNC_FULL_DAYS` (default 7) it sweeps the whole roster instead, since
prydwen can edit a detail page without touching the listing. The same sync runs
on its own schedule while the server is up (`HSR_SYNC_INTERVAL_HOURS`, default
24; `HSR_SYNC_DISABLED=1` turns it off).

The results are served under `/hsr`:

- `GET /hsr/characters` - full roster (what the planner offers as "characters you own")
- `GET /hsr/teams` - the ranked team index, every mode in one read
- `GET /hsr/team-index` - alias of `/hsr/teams`
- `GET /hsr/status` - last sync timestamps and source revision

`/hsr` in the frontend is the team planner: pick the characters you own, take
the highest-ranked team you can field, lock it, and the next suggestion draws
only from the characters that are still free. Selections and locks persist in
`localStorage`, and locks consume their members across every mode. A clean sync
also stamps `external_sync_state` in SQLite so the sitemap can give `/hsr` a
real `lastmod`.

### 3. Start the server

For development:

```bash
npm run dev
```

For a regular run:

```bash
npm start
```

With `PORT=3000`, the backend runs at `http://localhost:3000`.  
If `PORT` is missing, `app.js` falls back to `5000`.

## Useful scripts

- `npm run dev` - run backend with nodemon
- `npm start` - run backend normally
- `npm test` - run the Node test suite (`node --test`)
- `npm run generate:sitemap` - regenerate sitemap data
- `npm run scrape:mal:characters` - refresh the ranked local Arena character catalog
- `npm run sync:hsr` / `sync:hsr:full` - refresh Honkai: Star Rail characters, teams, and images from prydwen.gg- `npm run migrate:card-rarities` - preview rank-based rarity updates for stored cards
- `npm run prune:db-backups` / `:apply` - list (or delete) stale local DB backups
- `npm run repair:videos` - re-encode non-playable imported Pixie videos
- `npm run export:arena` / `export:levels` - dump Arena data to CSV

More one-off maintenance and migration scripts live in `scripts/`; run them directly with `node scripts/<name>` (for example `node scripts/mirror-discord-avatars.cjs` to backfill mirrored avatars).

## CI / Deployment

`.github/workflows/deploy.yml` runs `npm ci && npm test` on every push and PR to `main`. On a push to `main`, once tests pass, it ships an **atomic release** to the VPS: the source is uploaded to `/srv/mirabellier.com/api/releases/<sha>/`, `npm ci --omit=dev` runs there, `.env` + the SQLite DB + `images/` + `videos/` + the runtime `data/*` files are symlinked in from a persistent `shared/` tree, the `current` symlink is flipped with a single `rename(2)`, and pm2 (`mirabellier-api`, see `ecosystem.config.cjs`) is reloaded. A failed build or health check rolls back to the previous release; the last five are kept.

### nginx config

The main site block (`mirabellier.com` + `api.mirabellier.com`) is versioned at
`deploy/nginx/mirabellier.com.conf` and is the source of truth. On deploy the
workflow compares it against `/etc/nginx/sites-available/mirabellier.com` and,
when it differs, installs the candidate, runs `nginx -t`, and reloads nginx.
If validation fails the previous file is restored and the deploy aborts, so a
bad edit can never take the site down.

The `location /` block uses `try_files $uri $uri/index.html /index.html`. The
middle candidate is required: the frontend prerenders a real `index.html` per
route (`about/`, `blog/`, `arena/`, every blog post, every archived question
day, ...), and the usual `try_files $uri $uri/ /index.html` would match the bare
directory and answer `301 /about/` — contradicting the route's slash-less
canonical and og:url. Dropping `$uri/` also keeps directories without an
`index.html` on the SPA fallback instead of 301-ing into a 403.

Full details, the required GitHub secrets, and one-time server setup are in [`DEPLOY.md`](DEPLOY.md).

## Real-time (WebSocket)

Socket.IO is served at path `/ws` on the same HTTP server.

- `POST /auth/ws-token` - exchange the current session for a short-lived WS token
- The client connects with that token, then subscribes to Arena fight playback (start / advance / skip), TCG games, and the currently-watching anime feed
- Fight messages are gated by Turnstile verification and per-user rate limits

## Main route map

This is a summary of the busier groups, not an exhaustive list. Routes are shown unprefixed; `/v1/...` works too.

### Posts and blog

- `GET /posts`, `GET /posts/:id`, `POST /posts`, `PUT /posts/:id`, `DELETE /posts/:id`
- `POST /posts/:id/comments` - add comment
- `POST /posts/:id/like` - like/unlike post
- `GET /tags` - list unique blog tags
- `GET /blog/:id` - SEO/share page for a single blog route
- `POST /posts-img` - upload an image for posts (owner only)

### Auth and profile

- `GET /auth/discord`, `GET /auth/discord/callback` - Discord OAuth
- `POST /auth/ws-token` - short-lived WebSocket token
- `GET /me` - current authenticated user
- `POST /me` - update profile (+ avatar/banner upload)
- `POST /logout` - destroy session
- `GET /user/:id`, `GET /user/by-username/:username` - public profiles
- `GET /user/:id/stats` - public user stats
- `GET /user/:id/follow`, `POST /user/:id/follow` - follow state / toggle
- `GET /profile/:username` - SEO/share page
- `GET /profile-embed/:username.png`, `GET /api/profile-embed/:username.png` - profile share image

### Guestbook

- `GET /guestbook`, `POST /guestbook`
- `PATCH /guestbook/:id/position` - save note position
- `DELETE /guestbook/:id` - delete note (owner only)

### Arena (`/arena/...`)

- `GET /arena/profile`, `GET /arena/collection`, `GET /arena/leaderboard`, `GET /arena/hall-of-fame`
- `POST /arena/verify` - Turnstile human check
- `POST /arena/draw-card`, `POST /arena/draw-pack`, `POST /arena/mint`
- `POST /arena/collection/select-card`, `/sacrifice`, `/toggle-favorite`
- `POST /arena/fight`, `/fight/start`, `/fight/advance`, `/fight/skip`; `GET /arena/fight/state`
- `GET /arena/shop`, `/shop/cards`, `/shop/titles`; `POST /arena/shop/buy`, `/shop/equip`, `/shop/enhance`, `/shop/reroll-substat`, `/shop/use-consumable`, `/shop/titles/buy`, ...
- `GET /arena/skill-tree`; `POST /arena/skill-tree/activate`, `/skill-tree/reset`
- `POST /arena/loadout/save`, `/loadout/restore`, `/loadout/delete`
- Marketplace: `GET /arena/market/listings`, `/market/listings/mine`, `/market/price`; `POST /arena/market/listings`, `/market/listings/:id/buy`, `/market/listings/:id/cancel`
- Trading: `GET /arena/trade/...`; `POST /arena/trade/request`, `/trade/session/:id/offer-card`, `/trade/session/:id/confirm`, ...
- Notifications: `GET /arena/notifications`, `/notifications/unread-count`; `POST /arena/notifications/read-all`
- Updates (owner): `GET /arena/updates`, `POST /arena/updates`, `DELETE /arena/updates/:updateId`
- Compensations: `GET /arena/archive`; `POST /arena/compensations/claim`

### TCG (`/tcg/...`)

- `GET /tcg/active-game`, `GET /tcg/eligible-cards`, `GET /tcg/game/:gameId`
- `GET /tcg/queue`, `POST /tcg/queue`, `DELETE /tcg/queue`
- `POST /tcg/solo` - start a solo game
- `POST /tcg/game/:gameId/deck`, `POST /tcg/game/:gameId/action`

### Question of the Day

- `GET /question-of-the-day` - SEO/share page
- `GET /question-of-the-day/embed-image.png` - QOTD share image
- `GET /question-of-the-day/current`, `POST /question-of-the-day/current` (owner)
- `POST /question-of-the-day/current/answers` - submit answer
- `GET /question-of-the-day/admin/questions`, `POST .../admin/questions` (owner)
- `POST /question-of-the-day/admin/current/force-archive` (owner)
- `GET /question-of-the-day/archive`, `GET /question-of-the-day/archive/:recordedDate`
- `DELETE /question-of-the-day/answers/:id` (owner)

### Pixies (short video) (`/pixies/...`)

- `GET /pixies` - SEO/share feed page; `GET /pixies/:videoId` - share page
- `GET /pixies/feed`, `/search`, `/popular`, `/following`, `/tags`, `/user/:userId`
- `POST /pixies/:id/view`, `/:id/like`; `GET /pixies/:id/comments`, `POST /pixies/:id/comments`, `POST /pixies/:id/comments/:commentId/like`, `DELETE /pixies/:id/comments/:commentId`
- `POST /pixies/` - create; `DELETE /pixies/:id`
- Notifications: `GET /pixies/notifications`, `/notifications/unread-count`; `POST /pixies/notifications/read-all`, `/notifications/:id/read`
- Admin/import: `GET /admin/pixies`, `GET /admin/tiktok`, `GET /pixies/admin/tiktok/queue`, `POST /pixies/admin`, `POST /pixies/admin/resolve`, `GET/POST /pixies/admin/import/queue`, `POST /pixies/admin/import/queue/:id/retry`, `/:id/cancel`, `/clear`
- Raw media is served from `/videos/:filename`

### Twitch (`/twitch/...`)

- `GET /twitch/channels`, `POST /twitch/channels`, `DELETE /twitch/channels/:login`
- `GET /twitch/channels/:login/prediction`, `/accuracy`, `/profile`
- `POST /twitch/channels/:login/backfill`
- `GET /twitch/push/vapid-public-key`, `/push/status`; `POST /twitch/push/subscribe`, `DELETE /twitch/push/subscribe`

### Fan art

- `GET /fanart` - aggregated search across Safebooru / Gelbooru / Danbooru / Pixiv

### Admin (`/admin/...`, owner only)

- `GET /admin/users/lookup`, `/users/suggestions`, `/arena/characters/suggestions`, `/arena/metrics`
- `POST /admin/users/:userId/coins`, `/cards`, `/reset-draws`, `/clear-consumable-effects`
- `POST /admin/arena/compensations`, `/arena/card-shop/reroll`

### Anime, quotes, shrines, images

- `GET /anime` - SEO/share page; `GET /anime/currently-watching` - MAL-backed feed; `GET /anime/currently-watching/embed-image.png`
- `GET /quotes` - SEO/share page; `GET /quotes/embed-image.png`; `GET /quote-of-the-day` - snapshot payload
- `GET /hsr/characters`, `GET /hsr/teams`, `GET /hsr/team-index`, `GET /hsr/status` - Honkai: Star Rail roster and ranked team index from prydwen.gg
- `GET /shrines/pages`, `GET /shrines/pages/:slug`, `POST /shrines/pages` (owner), `PUT /shrines/pages/:slug` (owner)
- `GET /shrine`, `GET /shrine/:slug` - shrine SEO/share pages
- `GET /images/list`, `GET /images/meta/:filename`, `GET /images/:filename` - static image serving

## If something feels broken

- Check `mirabellier-backend/.env` first
- If login fails, verify Discord app credentials + callback URL
- If frontend auth redirects look wrong, verify `FRONTEND_URL`
- If local dev requests are blocked by CORS / Socket.IO / OAuth, set `ALLOW_DEV_ORIGINS=true` (dev only)
- If Turnstile blocks you locally, set `TURNSTILE_DEV_BYPASS=true` (dev only)
- If rate limiting seems too strict or per-IP buckets collapse, check `TRUST_PROXY_HOPS` matches your proxy chain (Cloudflare only = 1, Cloudflare + nginx = 2)
- If uploads fail, verify `IMAGES_DIR` path and file permissions
- If Pixie imports fail, verify `yt-dlp` + `ffmpeg` are installed and the relevant cookie file exists
- If MAL endpoints fail, verify `MAL_CLIENT_ID` and `MAL_USERNAME`
- If Twitch push fails, verify the VAPID keys and `VAPID_SUBJECT`
- If data seems stale, make sure only one local process is writing the same SQLite DB
- If owner-only routes return 403, verify `OWNER_DISCORD_IDS`

## Why this repo exists

I wanted the backend to stay understandable while still doing real app work.
Soft attitude, practical behavior, and sturdy enough to keep adding new little features without turning into spaghetti.

## License

Licensed under the [MIT License](./LICENSE).
