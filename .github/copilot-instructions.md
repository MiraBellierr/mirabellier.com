## Quick orientation

- **What this repo is:** Vite + React (TypeScript) frontend at the project root and a minimal Express backend in miraiscute-backend/ that serves/stores posts, images, and videos.
- **Frontend entry:** `src/main.tsx` (uses HashRouter) and `src/App.tsx` for routes and page wiring.
- **Backend entry:** `miraiscute-backend/app.js` — file-backed JSON endpoints and static files under `miraiscute-backend/images` and `miraiscute-backend/videos`.

## Key files & patterns

- **Backend endpoints:** `miraiscute-backend/app.js` implements `GET /posts`, `POST /posts`, `POST /posts-img`, `GET /videos`, `POST /upload-video`. Runtime data files: `miraiscute-backend/blog.json`, `miraiscute-backend/videos.json` (gitignored).
- **API usage in frontend:** several pages call the API directly (see `src/pages/Cats.tsx`, `src/pages/Videos.tsx`, `src/pages/BlogEdit.tsx`). Many call-sites use a hardcoded base: `https://mirabellier.my.id/api`.
- **Editor & uploads:** `src/lib/tiptap-utils.ts` and `src/pages/BlogEdit.tsx` handle image uploads and Tiptap integration. `vite.config.ts` creates a manual `tiptap` chunk.
- **Path alias:** `@` → `./src` (configured in `vite.config.ts`) — preserve when adding imports.

## Architecture notes (big picture)

- Single-page frontend (Vite + React) + minimal file-backed Express backend. Frontend is static; backend is stateful via JSON files and saved media.
- Routing is hash-based (`HashRouter`) to support static hosting without server rewrites.
- The design favors a small local dev backend that mirrors the production API surface (but not the production database).

## Developer workflows & useful commands

- Frontend dev:

  - Install deps: `npm install`
  - Run dev server: `npm run dev`
  - Build: `npm run build` (runs `tsc -b && vite build`)
  - Lint: `npm run lint`

- Backend dev (local):

  - Install & run: `cd miraiscute-backend && npm install && node app.js`
  - Backend stores runtime files under `miraiscute-backend/` — do not commit these.

- Override API base for local testing: replace hardcoded strings or set a Vite env var (suggestion: `VITE_API_BASE=http://localhost:3000`) and update call-sites in `src/pages/*` and `src/lib/tiptap-utils.ts`.

## Project-specific conventions & gotchas

- Hardcoded production API: search for `https://mirabellier.my.id/api` and replace or parameterize before local testing.
- File-backed persistence: `blog.json` and `videos.json` are created/updated at runtime and are gitignored — treat them as ephemeral local DB files.
- Media uploads: `multer` is used in the backend; uploaded media lands in `miraiscute-backend/images/` or `miraiscute-backend/videos/`.
- Large editor bundle: Tiptap extensions are manually chunked in `vite.config.ts`; changes to editor code can increase bundle size.

## Integration points & external dependencies

- External API host referenced: `https://mirabellier.my.id/api` (production). Frontend currently expects the same API shape locally.
- Backend packages: see `miraiscute-backend/package.json` (uses `express`, `multer`, etc.).

## Actionable guidance for an AI coding agent

- First steps:
  - Locate hardcoded API bases: grep for `mirabellier.my.id/api` and list files (likely `src/pages/*` and `src/lib/tiptap-utils.ts`).
  - Inspect `miraiscute-backend/app.js` to confirm endpoint behavior before changing frontend calls.
  - Do not commit runtime files created under `miraiscute-backend/`.

- When editing:
  - Preserve `@` alias imports.
  - If adding backend routes, follow the existing file-backed pattern and update `.gitignore` if new runtime files will be created.
  - Keep changes minimal, and prefer parameterizing API base via `VITE_API_BASE` rather than mass-replacing hardcoded URLs.

- Examples to reference when implementing changes:
  - Replace API base: update `src/pages/BlogEdit.tsx` and `src/lib/tiptap-utils.ts` to read from `import.meta.env.VITE_API_BASE`.
  - Start local backend for testing: `cd miraiscute-backend && node app.js` and test endpoints with curl or the frontend dev server.

## Quick verification checklist (what to run locally)

- Frontend dev server: `npm run dev` — verify pages load and editor initializes.
- Start backend: `cd miraiscute-backend && node app.js` — verify `GET /posts` returns JSON.
- If changing API base: set `VITE_API_BASE=http://localhost:3000` and rebuild/refresh the frontend.

If anything above is unclear or you want this merged differently (more/less detail, prefer a stronger env-var approach), tell me which section to expand or revise.