#!/usr/bin/env bash
#
# Installs the two download tools the Mirabellier backend needs for
# social video imports (/videos/admin/resolve + /videos/admin/import):
#
#   1. ffmpeg   — merges DASH streams (YouTube shorts are video+audio-only)
#   2. yt-dlp   — downloads videos + resolves metadata for IG/YT/TikTok
#
# Usage:
#   sudo ./scripts/setup-downloaders.sh
#
# Installs:
#   - ffmpeg via the distro package manager (apt / dnf / apk / pacman)
#   - yt-dlp standalone binary into /usr/local/bin (auto-updating)
#
# After running, restart the backend. No code changes or extra env vars are
# needed when both land on PATH; only set YTDLP_PATH in .env if you install
# yt-dlp somewhere custom.

set -euo pipefail

YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
YTDLP_BIN="/usr/local/bin/yt-dlp"
FFMPEG_BIN="/usr/local/bin/ffmpeg"

log() { printf '\033[1;34m[mirabellier]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[mirabellier]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run me with sudo (or as root):  sudo $0"

install_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1; then
    log "ffmpeg already installed: $(ffmpeg -version 2>&1 | head -n1)"
    return 0
  fi

  local manager=""
  [[ -x /usr/bin/apt-get ]] && manager="apt"
  [[ -x /usr/bin/dnf ]] && manager="dnf"
  [[ -x /sbin/apk ]] && manager="apk"
  [[ -x /usr/bin/pacman ]] && manager="pacman"

  case "$manager" in
    apt)
      apt-get update -y
      DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg
      ;;
    dnf)
      dnf install -y ffmpeg || dnf install -y epel-release && dnf install -y ffmpeg
      ;;
    apk)
      apk add --no-cache ffmpeg
      ;;
    pacman)
      pacman -Syu --noconfirm ffmpeg
      ;;
    *)
      die "no supported package manager found. Install ffmpeg yourself, then re-run."
      ;;
  esac

  command -v ffmpeg >/dev/null 2>&1 || die "ffmpeg install failed — check the package manager output above."
  log "ffmpeg installed: $(ffmpeg -version | head -n1)"
}

install_yt_dlp() {
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  log "downloading yt-dlp (latest) from GitHub..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$YTDLP_URL" -o "$tmp"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$tmp" "$YTDLP_URL"
  else
    die "need curl or wget to download yt-dlp."
  fi

  chmod +x "$tmp"
  mv -f "$tmp" "$YTDLP_BIN"

  log "yt-dlp installed: $("$YTDLP_BIN" --version)"
}

# ffmpeg must be on PATH for yt-dlp to find it automatically.
ensure_ffmpeg_on_path() {
  if command -v ffmpeg >/dev/null 2>&1 && [[ "$(command -v ffmpeg)" != "$FFMPEG_BIN" ]]; then
    if ln -sf "$(command -v ffmpeg)" "$FFMPEG_BIN"; then
      log "symlinked ffmpeg into /usr/local/bin"
    fi
  fi
}

install_ffmpeg
install_yt_dlp
ensure_ffmpeg_on_path

log "done."
printf '\n'
log "Verify:"
log "  ffmpeg -version   -> %s\n" "$(command -v ffmpeg)"
log "  yt-dlp --version  -> %s\n" "$(command -v yt-dlp)"
printf '\n'
log "Then restart the backend (e.g. systemctl restart mirabellier-backend)."
log "If yt-dlp is not on PATH for the backend process, set YTDLP_PATH in your .env."
