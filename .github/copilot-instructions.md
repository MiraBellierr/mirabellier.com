  ## Quick orientation

  - **What this repo is:** Vite + React (TypeScript) single-page frontend (root) plus a minimal Express backend in `miraiscute-backend/` that serves posts, images, videos, and sessions.
  - **Frontend entry:** `src/main.tsx` (uses `HashRouter`) and `src/App.tsx` for route wiring.
  - **Backend entry:** `miraiscute-backend/app.js` (binds to port `3000`) with route implementations under `miraiscute-backend/routes/`.

  ## Key components & where to look

  - **Frontend views:** `src/pages/` — examples: `Blog.tsx`, `BlogEdit.tsx`, `Videos.tsx`, `Cats.tsx`. Editor/upload helpers in `src/lib/tiptap-utils.ts`.
  - **Bundling & alias:** `vite.config.ts` sets `@` → `./src` and creates a manual `tiptap` chunk; preserve `@` imports and be mindful of editor code size.
  - **Backend:** `miraiscute-backend/app.js` wires `routes/` and uses helpers in `miraiscute-backend/lib/` (`db.js`, `uploads.js`, `users.js`). DB file: `miraiscute-backend/database.sqlite3`.
  - **Media & storage:** static files served from `miraiscute-backend/images/` and `miraiscute-backend/videos/` (created by ` lib/uploads.js`).

  ## Runtime facts & API surface

  - **Dev backend port:** `3000` (see [miraiscute-backend/app.js](../miraiscute-backend/app.js)).
  - **Notable endpoints:** `GET /posts`, `POST /posts`, auth endpoints in `routes/auth.js`, and upload endpoints in `routes/videos.js` and `routes/images.js`.
  - **Persistence:** SQLite (`miraiscute-backend/database.sqlite3`) with schema created in [miraiscute-backend/lib/db.js](../miraiscute-backend/lib/db.js).

  ## Developer workflows & commands

  - **Install (root):** `npm install`
  - **Frontend dev:** `npm run dev`
  - **Build:** `npm run build` (`tsc -b && vite build`)
  - **Lint:** `npm run lint`
  - **Start backend locally:**

    cd miraiscute-backend && npm install && node app.js

    (server will log `Server running on http://localhost:3000`)

  ## Project-specific conventions & gotchas

  - **Hardcoded production API:** many frontend call-sites reference `https://mirabellier.my.id/api`. Prefer parameterizing via `VITE_API_BASE` and use `import.meta.env.VITE_API_BASE`.
  - **Editor uploads & chunking:** `src/lib/tiptap-utils.ts` and `src/pages/BlogEdit.tsx` manage uploads; `vite.config.ts` intentionally chunks tiptap — avoid large, unchunked editor changes.
  - **Runtime artifacts:** do not commit `miraiscute-backend/database.sqlite3`, `miraiscute-backend/images/*`, or `miraiscute-backend/videos/*`.

  ## Actionable guidance for an AI coding agent (first actions)

  - **Inspect endpoints & shapes:** open ../miraiscute-backend/app.js and ../miraiscute-backend/routes/* to confirm request/response payloads before changing callers.
  - **Search for hardcoded base:** run a repo search for `mirabellier.my.id/api` and update specific files (recommended: [../src/pages/BlogEdit.tsx](../src/pages/BlogEdit.tsx), [../src/lib/tiptap-utils.ts](../src/lib/tiptap-utils.ts)).
  - **Safe replacement pattern:** use `const API_BASE = import.meta.env.VITE_API_BASE || 'https://mirabellier.my.id/api'` and update targeted call sites rather than mass-replacing.
  - **Add backend routes:** follow patterns in `routes/*.js`; use `lib/db.js` and `lib/uploads.js` helpers and export dependency functions like existing routes do.

  ## Quick verification checklist

  - Frontend: `npm run dev` — confirm pages render and the editor initializes.
  - Backend: `cd miraiscute-backend && node app.js` — confirm `GET /posts` returns JSON.
  - After changing API base: set `VITE_API_BASE=http://localhost:3000` and rebuild/refresh the frontend.

  If you'd like, I can run a repo-wide search for hardcoded API bases and open a small PR that replaces a couple of call-sites with `VITE_API_BASE`. Tell me which you'd prefer.