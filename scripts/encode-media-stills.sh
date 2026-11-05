#!/usr/bin/env bash
# Encodes library stills to the web files in client/public/media. Originals stay
# in the library and are never committed. Needs cwebp (brew install webp).
#
#   scripts/encode-media-stills.sh [library-folder]
#
# Files under /media are served with a one-year immutable cache (server/static.ts),
# so a changed image needs a new file name. The names carry the library id for that
# reason: a different source gets a different address.
set -euo pipefail

LIB="${1:-$HOME/Desktop/GridTilt/Brand & Assets/Higgsfield Library 2026-11}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/client/public/media"

# encode <source png> <output path under media/> <width> <quality>
encode() {
  mkdir -p "$(dirname "$OUT/$2")"
  cwebp -quiet -q "$4" -m 6 -sharp_yuv -metadata none -resize "$3" 0 "$LIB/$1" -o "$OUT/$2"
  printf '%8d  %s\n' "$(wc -c < "$OUT/$2")" "$2"
}

# State heroes: the README's top pick for each state with a published page.
encode "02 State heroes/Graded/MD-3-ac0af29c-graded.png" state/md-3-ac0af29c.webp 1920 92
encode "02 State heroes/Graded/VA-2-c34faa21-graded.png" state/va-2-c34faa21.webp 1920 92
encode "02 State heroes/Graded/TX-1-ac1949bb-graded.png" state/tx-1-ac1949bb.webp 1920 92
