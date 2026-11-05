#!/usr/bin/env bash
# Encodes the library's silent web rotation clips (05 Rotation/Web) down to 720p
# H.264 at 1.85 Mbps, no audio, fast start, because the web files at 5.3 MB each
# would put the site's video over the 60 MB limit. Writes each clip's first frame as
# its poster, so nothing jumps when it starts. Needs swiftc, cwebp and python3 with
# opencv.
#
#   scripts/encode-media-clips.sh [library-folder]
#
# If swiftc refuses the default SDK, set SWIFT_SDK to one it accepts, for example
#   SWIFT_SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX15.2.sdk
#
# Files under /media are served with a one-year immutable cache (server/static.ts),
# so a changed clip needs a new suffix.
set -euo pipefail

LIB="${1:-$HOME/Desktop/GridTilt/Brand & Assets/Higgsfield Library 2026-11}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/client/public/media/clips"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

swiftc -O -suppress-warnings ${SWIFT_SDK:+-sdk "$SWIFT_SDK"} "$ROOT/scripts/encode-clip.swift" -o "$TMP/encode-clip"

# clip <name in the library's 05 Rotation/Web folder>
clip() {
  "$TMP/encode-clip" "$LIB/05 Rotation/Web/$1.mp4" "$TMP/$1.mp4" 1280 720 1850000 >/dev/null
  cp "$TMP/$1.mp4" "$OUT/$1-v1.mp4"
  python3 -c 'import cv2, sys; ok, f = cv2.VideoCapture(sys.argv[1]).read(); assert ok; cv2.imwrite(sys.argv[2], f)' "$TMP/$1.mp4" "$TMP/$1.png"
  cwebp -quiet -q 88 -m 6 -sharp_yuv -metadata none "$TMP/$1.png" -o "$OUT/$1-v1.webp"
  printf '%10d  clips/%s\n%10d  clips/%s\n' "$(wc -c < "$OUT/$1-v1.mp4")" "$1-v1.mp4" "$(wc -c < "$OUT/$1-v1.webp")" "$1-v1.webp"
}

clip thu-grid-backlog
