// pm2 process definition for the Mirabellier backend API.
//
// Deployed by .github/workflows/deploy.yml as an atomic release under
// /srv/mirabellier.com/api:
//
//   /srv/mirabellier.com/api/
//   ├── releases/<sha>/          full source + node_modules (npm ci on the box)
//   ├── shared/                  persists across releases
//   │   ├── .env                 server-managed secrets (required)
//   │   ├── database.sqlite3     + -wal / -shm / backups
//   │   ├── images/  videos/
//   │   └── data/                tiktok/instagram/youtube cookies, avatar-cache
//   └── current -> releases/<sha>
//
// Each release symlinks .env, database.sqlite3, images, videos and the
// runtime data/* files back to shared/, so `node app.js` from `current`
// sees persistent state. app.js loads .env from `__dirname/.env` itself,
// so `cwd` below is for tidiness, not correctness.
module.exports = {
  apps: [
    {
      name: "mirabellier-api",
      script: "app.js",
      cwd: "/srv/mirabellier.com/api/current",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      max_memory_restart: "768M",
      kill_timeout: 8000,
      env: {
        NODE_ENV: "production",
        // The frontend release tree served by nginx. Runtime sitemap / feed /
        // IndexNow-key regeneration writes here (see lib/discovery-output.js);
        // without it those files land in the retired /var/www/mirabellier/dist
        // path and never reach visitors.
        FRONTEND_DEPLOY_PATH: "/var/www/mirabellier.com/current",
      },
      error_file: "/srv/mirabellier.com/api/shared/logs/pm2-error.log",
      out_file: "/srv/mirabellier.com/api/shared/logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
