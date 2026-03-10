# Mirabellier.com
![](https://i.pinimg.com/1200x/91/0f/e0/910fe0a70293589ee9834d7f5bdf1645.jpg)

This is the frontend for my little corner of the web.

It is a cute React + TypeScript site where I share blog posts, daily quotes, profile pages, anime updates, a draggable guestbook board, and other cozy internet things. The goal is simple: make the site feel soft and personal without turning the code into a mess.

## Hiya!!

If you are reading this repo, welcome. This part of the project is the part people actually see. It handles the pages, the styling, the blog UI, the editor screen, the profile pages, the little decorative details, and all the cute presentation stuff that makes the site feel like mine.

## What lives here

- A home page and about page with a personal, handmade feel
- A blog list and blog post pages
- A guestbook board and a guestbook signing page
- A Tiptap editor UI for writing posts
- Login, settings, and profile screens
- A daily quotes page
- An anime list and admin page
- Shared layout pieces like the header, footer, navigation, and cards

## Tiny project tour

```text
.
|- src/
|  |- pages/         Route pages like Home, Blog, Guestbook, Quotes
|  |- parts/         Shared layout pieces like Header and Footer
|  |- components/    Reusable UI and Tiptap pieces
|  |- hooks/         React hooks
|  |- lib/           Utilities and API helpers
|  `- states/        React context providers
|- public/           Static public files
|- index.html        Vite entry HTML
`- package.json      Frontend scripts
```

## The stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- `react-router-dom`
- Tiptap

## Running it locally

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Use `.env.example` as your starting point.

```env
VITE_API_BASE=http://localhost:3000
WEBSITE_BASE=http://localhost:5173
```

### 3. Start the frontend

```bash
npm run dev
```

The app will open at `http://localhost:5173`.

This frontend expects an API at `VITE_API_BASE`. If your backend uses a different local port, change that value to match. The matching API has its own guide in [mirabellier-backend/README.md](./mirabellier-backend/README.md).

## Useful scripts

- `npm run dev` - start the frontend dev server
- `npm run build` - type-check and build the app
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint
- `npm run generate:sitemap` - regenerate sitemap data from the current content
- `npm run predeploy` - generate sitemap data and build
- `npm run deploy` - deploy the built frontend

## A few nice details

- Non-critical pages are lazy-loaded to keep the first load lighter
- Background images are preloaded for a nicer first paint
- The site supports dark mode
- There is a custom cursor system
- The blog editor uses Tiptap instead of a plain textarea
- Blog post likes work even if the visitor is not logged in
- The guestbook board supports dragging, board-only zoom, and synced note positions
- The overall UI is meant to feel more like a personal homepage than a generic product site

## Main pages

- `/` - home page
- `/about` - about page
- `/guestbook` - draggable guestbook board
- `/guestbook/sign` - guestbook signing page
- `/blog` - blog listing
- `/blog/:slug` - single blog post
- `/blog/edit` - editor page
- `/quotes` - daily quotes page
- `/login` - login page
- `/auth/callback` - Discord login callback page
- `/settings` - account settings
- `/profile` - your own profile page when logged in
- `/profile/:username` - public profile page
- `/admin/anime` - anime admin page

## If something feels broken

- Make sure `VITE_API_BASE` points at a running API
- If blog data, guestbook notes, or quotes are missing, the frontend is probably not reaching the backend
- If login does not work, check the backend auth setup before changing frontend code
- If styling looks odd, make sure the Vite dev server actually finished rebuilding
- If the guestbook board feels strange after a layout change, check the board CSS and the API response shape together

## Why this repo exists

This frontend is where I try to make code feel warm. I wanted pages that feel cute, but still have enough structure to grow properly as the site gets bigger.

If you are reading through the code, that is the main idea behind it: playful on the surface, practical underneath.
