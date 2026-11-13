#!/usr/bin/env bash
# Copies the re-cut web video set from the library into client/public/media and
# prints the MP4 total against the repo's 60 MB limit. Files that are not there
# yet are listed and skipped. Never point this at the DRAFT mp4s: their end cards
# carry the wrong logo.
#
#   scripts/copy-recut-video.sh [library-folder]
#
# Files under /media are served with a one-year immutable cache (server/static.ts),
# so a later re-cut needs a new suffix here and in the pages that name the files.
set -euo pipefail

LIB="${1:-$HOME/Desktop/GridTilt/Brand & Assets/Higgsfield Library 2026-11}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/client/public/media"

# copy <source under the library> <output under media/>
copy() {
  if [ -f "$LIB/$1" ]; then
    mkdir -p "$(dirname "$OUT/$2")"
    cp "$LIB/$1" "$OUT/$2"
    printf '%10d  %s\n' "$(wc -c < "$OUT/$2")" "$2"
  else
    echo "   missing  $1"
  fi
}

for name in E1-who-runs-your-grid E2-three-megawatt-numbers E3-what-is-the-queue; do
  lower="$(echo "$name" | tr '[:upper:]' '[:lower:]')"
  copy "04 Explainers/Web/$name.mp4"        "explainers/$lower-v1.mp4"
  copy "04 Explainers/Web/$name-poster.jpg" "explainers/$lower-v1.jpg"
  copy "04 Explainers/Web/$name.vtt"        "explainers/$lower-v1.vtt"
done
copy "06 Launch film/Web/FILM-launch.mp4"        film/gridtilt-film-v1.mp4
copy "06 Launch film/Web/FILM-launch-poster.jpg" film/gridtilt-film-v1.jpg
copy "06 Launch film/Web/FILM-launch.vtt"        film/gridtilt-film-v1.vtt

total="$(find "$OUT" -name '*.mp4' -exec wc -c {} + 2>/dev/null | awk 'END {print $1+0}')"
printf 'MP4 total under media/: %.2f MB (limit 60)\n' "$(echo "$total / 1000000" | bc -l)"
