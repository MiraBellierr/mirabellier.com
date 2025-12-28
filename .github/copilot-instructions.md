## Quick orientation

- **Repo layout:** frontend (root) — Vite + React (TypeScript); backend — minimal Express app in `miraiscute-backend/`.
- **Frontend entry:** [src/main.tsx](src/main.tsx) (uses `HashRouter`) and [src/App.tsx](src/App.tsx).
- **Backend entry:** [miraiscute-backend/app.js](miraiscute-backend/app.js) (registers `routes/`, serves `/images` and `/videos`, uses `lib/` helpers).

## Key components & where to look

- **Pages / UI:** `src/pages/` — e.g. `Blog.tsx`, `BlogEdit.tsx`, `Videos.tsx`, `Cats.tsx`.
- **Editor / uploads:** `src/lib/tiptap-utils.ts` (upload helpers, `MAX_FILE_SIZE`, URL building) and `src/components/tiptap-templates/` (editor templates).
- **Config + aliases:** `vite.config.ts` maps `@` → `./src` and creates a manual tiptap chunk — avoid changes that bloat the editor chunk.
- **Backend routes & helpers:** `miraiscute-backend/routes/` (routes) and `miraiscute-backend/lib/` (`db.js`, `uploads.js`, `users.js`).

## Runtime facts & API surface

- **Dev backend port:** 3000 (see [miraiscute-backend/app.js](miraiscute-backend/app.js)).
- **Common endpoints:** `GET /posts`, `POST /posts`, `PUT /posts/:id`, `/auth` routes, `/images` and `/videos` upload routes.
- **Static/media storage:** [miraiscute-backend/images/](miraiscute-backend/images) and [miraiscute-backend/videos/](miraiscute-backend/videos) (created at runtime by uploads helper).
- **DB file:** [miraiscute-backend/database.sqlite3](miraiscute-backend/database.sqlite3); schema managed in [miraiscute-backend/lib/db.js](miraiscute-backend/lib/db.js).

## Developer workflows & commands

- Install dependencies (root):

  npm install

- Frontend dev:

  npm run dev

- Build frontend:

  npm run build    # runs `tsc -b && vite build`

- Backend (dev):

  cd miraiscute-backend
  npm install
  node app.js

  (server logs: "Server running on http://localhost:3000")

## Project-specific conventions & gotchas

- **API base handling:** The codebase uses an `API_BASE` constant in several places. Prefer `VITE_API_BASE` (frontend env) and construct `const API_BASE = import.meta.env.VITE_API_BASE || 'https://mirabellier.my.id/api'` in `src/lib/config.ts` or callers. Targeted replacements are safer than global find/replace.
- **Editor chunking:** `vite.config.ts` intentionally isolates `tiptap` into its own chunk — keep editor-related imports and size-conscious changes around `src/components/tiptap-*` and `src/lib/tiptap-utils.ts`.
- **Uploads:** Frontend uploads hit endpoints like `${API_BASE}/posts-img` (see `handleImageUpload` in `src/lib/tiptap-utils.ts`). Backend upload logic lives in `miraiscute-backend/lib/uploads.js` and routes in `miraiscute-backend/routes/images.js` and `routes/videos.js`.
- **Do not commit runtime artifacts:** `miraiscute-backend/database.sqlite3`, `miraiscute-backend/images/*`, `miraiscute-backend/videos/*` should be considered transient.

## Actionable first actions for an AI coding agent

1. Open [miraiscute-backend/app.js](miraiscute-backend/app.js) and `miraiscute-backend/routes/*` to confirm request/response shapes.
2. Inspect `src/lib/config.ts` / `src/lib/tiptap-utils.ts` and `src/pages/BlogEdit.tsx` to find hardcoded API base usage (common target: `https://mirabellier.my.id/api`).
3. When changing API base: update only a few call sites and prefer a single `API_BASE` import from `src/lib/config.ts`.
4. For backend changes, follow patterns in existing route modules (dependency injections used in `app.js`), use `lib/db.js` helpers, and preserve the exports shape.

## Quick verification checklist

- Frontend: `npm run dev` — verify pages render and editor initializes.
- Backend: `cd miraiscute-backend && node app.js` — verify `GET /posts` returns JSON.
- After changing API base: set `VITE_API_BASE=http://localhost:3000` before running the frontend dev server.

If you want, I can run a repo-wide search for `mirabellier.my.id/api` and open a targeted PR that parameterizes the few call sites. Reply if you'd like that automated change.