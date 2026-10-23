#!/usr/bin/env bash
#
# Sets up Proof-of-Origin (POT) support so yt-dlp can download YouTube videos
# from the server even when YouTube bot-walls its datacenter IP ("Sign in to
# confirm you're not a bot" / "The page needs to be reloaded.").
#
# What it does:
#   1. Ensures yt-dlp is new enough to use POT provider plugins (>= 2025.05.22)
#   2. Runs the bgutil POT provider HTTP server as a Docker container
#      (brainicism/bgutil-ytdlp-pot-provider) on 127.0.0.1:4416
#   3. Installs the bgutil plugin next to yt-dlp so yt-dlp auto-fetches tokens
#   4. Verifies the site's data/youtube-cookies.txt is a LOGGED-IN session
#      (a logged-out export does not defeat the bot check)
#   5. Optionally pulls + restarts the backend so the new code is live
#
# Usage (as root, on the VPS):
#   ./scripts/setup-youtube-pot-provider.sh [--update-code] [backend_dir]
#
# backend_dir defaults to /srv/mirabellier.com/api.
# Pass --update-code to also `git pull` that checkout and restart the backend
# (requires the new code to be pushed to GitHub first, and a clean checkout).
#
# After the cookies check below says PASS, YouTube imports in the admin pixies
# page work again. If it says FAIL, re-export cookies from a browser that is
# actually logged in at youtube.com into data/youtube-cookies.txt and re-run.

set -euo pipefail

UPDATE_CODE=""
BACKEND_DIR="/srv/mirabellier.com/api"
for arg in "$@"; do
  case "$arg" in
    --update-code) UPDATE_CODE="1" ;;
    --help|-h)
      sed -n '1,40p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) BACKEND_DIR="$arg" ;;
  esac
done

POT_PORT="4416"
POT_IMAGE="brainicism/bgutil-ytdlp-pot-provider"
POT_CONTAINER="bgutil-provider"
YTDLP_BIN="/usr/local/bin/yt-dlp"
YTDLP_MIN_VERSION="2025.05.22"
PROBE_URL="https://www.youtube.com/watch?v=aQIgcpZS0uM"

log() { printf '\033[1;34m[mirabellier]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[mirabellier]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run me with sudo (or as root):  sudo $0"
command -v docker >/dev/null 2>&1 || die "docker is not installed."
command -v curl >/dev/null 2>&1 || die "curl is not installed."
[[ -d "$BACKEND_DIR" ]] || die "backend dir not found: $BACKEND_DIR"

version_at_least() {
  local have="$1" need="$2" ha hb hc na nb nc
  IFS='.' read -r ha hb hc <<<"${have%%-*}"
  IFS='.' read -r na nb nc <<<"${need%%-*}"
  [[ "${ha:-0}" -gt "${na:-0}" ]] && return 0
  [[ "${ha:-0}" -lt "${na:-0}" ]] && return 1
  [[ "${hb:-0}" -gt "${nb:-0}" ]] && return 0
  [[ "${hb:-0}" -lt "${nb:-0}" ]] && return 1
  [[ "${hc:-0}" -ge "${nc:-0}" ]]
}

# Read YTDLP_PATH from the backend .env if set, so we upgrade/verify the exact
# binary the backend spawns.
if [[ -f "$BACKEND_DIR/.env" ]] && grep -q '^YTDLP_PATH=' "$BACKEND_DIR/.env"; then
  YTDLP_BIN="$(grep '^YTDLP_PATH=' "$BACKEND_DIR/.env" | head -n1 | cut -d= -f2- | tr -d '"'"'")"
fi
[[ -x "$YTDLP_BIN" ]] || YTDLP_BIN="$(command -v yt-dlp || true)"
[[ -n "$YTDLP_BIN" ]] || die "yt-dlp not found — run scripts/setup-downloaders.sh first."

log "yt-dlp: $YTDLP_BIN ($("$YTDLP_BIN" --version))"

update_yt_dlp() {
  log "updating yt-dlp from GitHub (latest)..."
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$tmp"
  chmod +x "$tmp"
  mv -f "$tmp" "$YTDLP_BIN"
  log "yt-dlp now: $("$YTDLP_BIN" --version)"
}

ensure_yt_dlp_version() {
  local version
  version="$("$YTDLP_BIN" --version 2>/dev/null || echo "0.0.0")"
  if ! version_at_least "$version" "$YTDLP_MIN_VERSION"; then
    die "yt-dlp $version is too old for POT plugins (need >= $YTDLP_MIN_VERSION). Please update yt-dlp and re-run."
  fi
}

install_plugin() {
  # Plugins are discovered next to the executable and in root's config dir —
  # drop the release zip in both so discovery cannot miss.
  local release_url
  release_url="$(
    curl -fsSL https://api.github.com/repos/Brainicism/bgutil-ytdlp-pot-provider/releases/latest |
      grep -oE '"browser_download_url": *"[^"]+\.zip"' | head -n1 | cut -d'"' -f4
  )"
  [[ -n "$release_url" ]] || die "could not find the bgutil plugin release download URL."
  log "installing POT provider plugin from: $release_url"

  local target_dirs
  target_dirs=("$(dirname "$YTDLP_BIN")/plugins" "/root/.config/yt-dlp/plugins")
  for dir in "${target_dirs[@]}"; do
    mkdir -p "$dir"
    local tmp
    tmp="$(mktemp)"
    curl -fsSL "$release_url" -o "$tmp"
    mv -f "$tmp" "$dir/bgutil-ytdlp-pot-provider.zip"
    log "installed plugin zip into $dir"
  done

  # A side install via pip covers python-based yt-dlp setups too.
  if command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --quiet --upgrade bgutil-ytdlp-pot-provider 2>/dev/null || true
  fi
}

verify_plugin_visible() {
  log "verifying yt-dlp sees the POT provider plugin..."
  local out
  out="$("$YTDLP_BIN" -v --get-id --no-warn "$PROBE_URL" 2>&1 || true)"
  if grep -q "PO Token Providers.*bgutil" <<<"$out"; then
    log "OK: yt-dlp has the bgutil POT provider:"
    grep -oE "PO Token Providers: .*" <<<"$out" | head -n1 | sed 's/^/     /'
    return 0
  fi
  log "WARNING: plugin not visible in yt-dlp's debug output. Install the zip from"
  log "  https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/latest"
  log "  into $(dirname "$YTDLP_BIN")/plugins/ manually, then re-run this script."
  return 1
}

start_pot_server() {
  if docker ps --format '{{.Names}}' | grep -qx "$POT_CONTAINER"; then
    log "POT provider container '$POT_CONTAINER' already running."
    return 0
  fi
  log "starting bgutil POT provider container on 127.0.0.1:$POT_PORT..."
  docker rm -f "$POT_CONTAINER" >/dev/null 2>&1 || true
  docker pull "$POT_IMAGE" >/dev/null
  docker run -d --name "$POT_CONTAINER" --init --restart unless-stopped \
    -p "127.0.0.1:$POT_PORT:$POT_PORT" \
    "$POT_IMAGE" --host 0.0.0.0 >/dev/null
  sleep 3
  docker ps --format '{{.Names}} {{.Status}}' | grep -q "$POT_CONTAINER" \
    || die "POT provider container failed to start — run: docker logs $POT_CONTAINER"
  log "POT provider running: $(docker ps --format '{{.Names}} {{.Status}}' | grep "$POT_CONTAINER")"
}

check_cookies_logged_in() {
  local cookies_file="${YOUTUBE_COOKIES_FILE:-$BACKEND_DIR/data/youtube-cookies.txt}"
  [[ -f "$cookies_file" ]] || {
    log "NOTE: no YouTube cookie file at $cookies_file — YouTube imports will still be bot-walled."
    log "  Log in at youtube.com in a browser, export cookies (Netscape cookies.txt),"
    log "  save them as $cookies_file, then re-run."
    return 0
  }

  local header
  header="$(
    awk -F '\t' '/^\.?(www\.)?(youtube|google)\.com\t/{printf "%s=%s; ", $6, $7}' "$cookies_file"
  )"

  local body
  body="$(curl -fsSL \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" \
    -H "Accept-Language: en-US,en;q=0.9" \
    -H "Cookie: $header" \
    https://www.youtube.com/feed/subscriptions || true)"

  if grep -q "AVATAR_LOGGED_IN" <<<"$body"; then
    log "OK: $cookies_file is a LOGGED-IN YouTube session."
  elif grep -q "AVATAR_LOGGED_OUT" <<<"$body"; then
    log "FAIL: $cookies_file is a LOGGED-OUT session — YouTube will keep rejecting imports."
    log "  Re-export cookies from a browser that is signed in at youtube.com (SID/SSID/__Secure-1PSID"
    log "  must be present) and overwrite $cookies_file, then re-run this script."
  else
    log "WARNING: could not determine the login state of $cookies_file (YouTube may be"
    log "  bot-walling the check itself). Proceeding anyway."
  fi
}

update_and_restart_backend() {
  if [[ "$UPDATE_CODE" != "--update-code" ]]; then
    log "skipping backend code update (pass --update-code to git-pull + restart)."
    return 0
  fi

  log "pulling latest backend code into $BACKEND_DIR..."
  git -C "$BACKEND_DIR" fetch --tags origin 2>/dev/null || git -C "$BACKEND_DIR" fetch origin
  local branch
  branch="$(git -C "$BACKEND_DIR" symbolic-ref --short HEAD 2>/dev/null || echo main)"
  git -C "$BACKEND_DIR" pull --ff-only origin "$branch"

  local restart_target=""
  if command -v pm2 >/dev/null 2>&1; then
    restart_target="$(
      BACKEND_DIR="$BACKEND_DIR" pm2 jlist 2>/dev/null | python3 -c '
import json, os, sys
backend = os.environ.get("BACKEND_DIR", "")
try:
    procs = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for p in procs:
    script = (p.get("pm2_env") or {}).get("pm_exec_path") or ""
    name = (p.get("pm2_env") or {}).get("name") or ""
    if script.startswith(backend) and script.endswith("app.js"):
        print(name)
        break
' | head -n1
    )"
  fi
  if [[ -n "$restart_target" ]]; then
    pm2 restart "$restart_target" >/dev/null
    log "restarted pm2 process: $restart_target"
  elif command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service --no-legend 2>/dev/null | grep -qE "mirabellier"; then
    systemctl restart mirabellier-backend
    log "restarted service: mirabellier-backend"
  else
    log "WARNING: could not find how the backend is managed — restart it yourself"
    log "  (e.g. pm2 restart <name>, or systemctl restart mirabellier-backend)."
  fi
}

final_probe() {
  local cookies_file="${YOUTUBE_COOKIES_FILE:-$BACKEND_DIR/data/youtube-cookies.txt}"
  local cookie_args=()
  if [[ -f "$cookies_file" ]]; then
    cookie_args=(--cookies "$cookies_file")
  fi
  log "probing YouTube with the site cookies + POT provider..."
  local out
  out="$("$YTDLP_BIN" --no-playlist --no-warn --socket-timeout 15 \
    "${cookie_args[@]}" \
    --skip-download --print '%(title)s' "$PROBE_URL" 2>&1 || true)"
  if [[ -n "$out" ]] && ! grep -qiE "not a bot|needs to be reloaded|ERROR" <<<"$out"; then
    log "SUCCESS: yt-dlp resolved the probe video:"
    log "  $(echo "$out" | tail -n1)"
    log "YouTube imports in the admin pixies page should now work."
  else
    log "NOTE: the probe was still rejected (see output below). Fix the cookie file or"
    log "  provider state, then re-run. You can still upload videos manually."
    log "  probe output: $(echo "$out" | tail -n1)"
  fi
}

ensure_yt_dlp_version
start_pot_server
install_plugin
verify_plugin_visible || true
check_cookies_logged_in
update_and_restart_backend
final_probe

log "done. Re-test on /admin/pixies with a YouTube link."
