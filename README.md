# Mirabellier.com
![](https://i.pinimg.com/1200x/91/0f/e0/910fe0a70293589ee9834d7f5bdf1645.jpg)

This is the frontend for my little corner of the web.

It is a cozy React + TypeScript app where I share blog posts, shrines, anime updates, question-of-the-day prompts, a draggable guestbook board, and other soft internet things.

## Hiya!!

If you are peeking around this repo, welcome welcome. This part is the one people actually see: pages, styling, route flow, cute details, and all the UI bits that make the site feel personal.

## What this frontend does

- Renders all public and logged-in pages for `mirabellier.com`
- Calls the backend API for blog, profile, guestbook, anime, and quote/question data
- Handles auth-related routes like login and callback flow
- Includes rich blog editing with Tiptap
- Ships the production static build for deployment

## What lives here

- Home/about/projects pages with a handmade personal style
- Blog list, blog post, and blog editor screens
- Character shrine routes (including dynamic shrine entries)
- Guestbook board and guestbook signing page
- Question of the Day page plus archive pages
- Quotes page and anime page
- Arena pages (fight, shop, crafting, leaderboard, collection)
- Admin pages for question-of-the-day and shrine management
- Shared layout pieces, context providers, hooks, and reusable components

## Tiny project tour

```text
.
|- src/
|  |- assets/        Images, icons, and frontend assets
|  |- components/    Reusable UI + Tiptap components
|  |- database/      Frontend-side data helpers/constants
|  |- hooks/         React hooks
|  |- lib/           API config and utility helpers
|  |- pages/         Route pages
|  |- parts/         Layout/chrome pieces
|  |- states/        Context providers (auth, cursor, etc.)
|  |- styles/        Extra style modules
|  |- App.tsx        Route tree
|  `- main.tsx       App bootstrap
|- public/           Static public files
|- index.html        Vite HTML entry
|- vite.config.ts    Vite config
`- package.json      Frontend scripts and deps
```

## The stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Tiptap

## Running it locally

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Copy `.env.example` to `.env`, then set values for your environment.

```env
VITE_API_BASE=https://api.mirabellier.com/v1
WEBSITE_BASE=https://mirabellier.com
```

For local backend development, `VITE_API_BASE` is usually something like `http://localhost:3000/v1`.

### 3. Start the frontend

```bash
npm run dev
```

The app runs at `http://localhost:5173` by default.

This frontend expects a working API at `VITE_API_BASE`. Backend setup lives in [mirabellier-backend/README.md](./mirabellier-backend/README.md).

## Useful scripts

- `npm run dev` - start Vite dev server
- `npm run build` - run TypeScript build + production Vite build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm run backend:dev` - run backend app entry from repo root
- `npm run generate:sitemap` - regenerate sitemap data
- `npm run predeploy` - generate sitemap and build
- `npm run deploy` - deploy `dist/` with `gh-pages`
- `npm run indexnow:submit-all` - submit all sitemap URLs to IndexNow

## Main route map

- `/` - home page
- `/home` - alias redirect to `/`
- `/about` - about page
- `/projects` - projects page
- `/anime` - anime page
- `/arena` - arena home
- `/arena/fight` - arena fight page
- `/arena/shop` - arena shop page
- `/arena/crafting` - arena crafting page
- `/arena/leaderboard` - arena leaderboard page
- `/arena/collection` - arena collection page
- `/arena/market` - player card marketplace
- `/arena/skill-tree` - arena skill tree page
- `/shrine` - shrine hub
- `/shrine/kanna` - Kanna shrine page
- `/shrine/rossina` - Rossina shrine page
- `/shrine/:slug` - dynamic shrine entry page
- `/quotes` - quotes page
- `/question-of-the-day` - question of the day page
- `/question-of-the-day/archive` - question archive list
- `/question-of-the-day/archive/:recordedDate` - archive day detail
- `/guestbook` - draggable guestbook board
- `/guestbook/sign` - guestbook signing page
- `/blog` - blog list
- `/blog/:slug` - single blog post
- `/blog/edit` - blog editor page
- `/admin` - admin home
- `/admin/question-of-the-day` - admin question management
- `/admin/shrines` - admin shrine management
- `/admin/shrines/preview` - shrine preview page
- `/login` - login page
- `/auth/callback` - auth callback page
- `/settings` - account settings
- `/profile` - your profile page when logged in
- `/profile/:username` - public profile page by username

## If something feels broken

- Check `.env` first, especially `VITE_API_BASE`
- Make sure the backend is actually running and reachable
- If auth fails, check backend Discord/OAuth settings before changing frontend logic
- If routes load blank after deploy, rebuild and verify static asset paths
- If styling looks strange, restart `npm run dev` so Vite can rebuild cleanly

## Why this repo exists

This frontend is where I try to make code feel warm.  
Cute on the surface, practical underneath, and comfy to keep growing over time.
