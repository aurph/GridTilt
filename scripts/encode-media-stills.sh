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

# The Buildout Brief's masthead: Research and Subscribe.
encode "03 Brief/Graded/MH-1-72737b63-graded.png" brief/mh-1-72737b63.webp 1920 92

# share <source png> <output path under media/> : a 1200 x 630 JPEG, center cropped.
share() {
  python3 - "$LIB/$1" "$OUT/$2" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
w, h = im.size
target = 1200 / 630
if w / h > target:
    nw = round(h * target)
    box = ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
else:
    nh = round(w / target)
    box = (0, (h - nh) // 2, w, (h - nh) // 2 + nh)
im.crop(box).resize((1200, 630), Image.LANCZOS).save(sys.argv[2], quality=84, optimize=True, progressive=True)
PY
  printf '%8d  %s\n' "$(wc -c < "$OUT/$2")" "$2"
}
mkdir -p "$OUT/share"

# A share image, for a page whose text card says less than a picture would.
share "03 Brief/Graded/MH-1-72737b63-graded.png" share/subscribe-mh-1-v1.jpg

# Small thumbnails for the explainer triggers on Research.
encode "04 Explainers/Web/E1-who-runs-your-grid-poster.jpg" explainers/e1-who-runs-your-grid-thumb-v1.webp 192 72
encode "04 Explainers/Web/E2-three-megawatt-numbers-poster.jpg" explainers/e2-three-megawatt-numbers-thumb-v1.webp 192 72
encode "04 Explainers/Web/E3-what-is-the-queue-poster.jpg" explainers/e3-what-is-the-queue-thumb-v1.webp 192 72
