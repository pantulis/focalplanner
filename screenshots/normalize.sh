#!/bin/bash
#
# normalize.sh — frame app-window screenshots uniformly for docs / README.
#
# Takes the raw window screenshots in this folder (each is the app window
# composited on a gradient backdrop, at varying sizes) and produces:
#   normalized/      full-res (2x) frames — identical dimensions, window
#                    centered on a uniform backdrop with an equal border
#   normalized/1x/   half-size versions for embedding in the README
#
# Originals (the *.png in this folder) are never modified.
#
# How it works: the window content is opaque and sits on a smooth gradient, so
# we find each window's rectangle by scanning the center row/column inward for
# the first sharp brightness transition (the crisp window border) — robust to
# the gradient and to light/dark themes. Every window is then re-centered on a
# freshly generated backdrop so all outputs share one size and one border.
#
# Requires ImageMagick (`magick`). Run from anywhere:
#   ./normalize.sh           # PNG output only
#   ./normalize.sh --webp    # also emit lightweight WebP 1x for the README
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_2X="$DIR/normalized"
OUT_1X="$OUT_2X/1x"

# ── Tunables ────────────────────────────────────────────────────────────────
BORDER=120                         # equal margin around the window (source px)
THRESH=45                          # min |Δ(r+g+b)| counted as a window edge
GRAD_TOP='#3F6BAC'                 # backdrop gradient (top → bottom)
GRAD_BOTTOM='#10294F'
SHADOW='55x22+0+0'                 # symmetric drop shadow (offset 0 = centered)
SCALE='50%'                        # 1x downscale factor
WEBP_QUALITY=82                    # WebP quality for README versions

DO_WEBP=0
for arg in "$@"; do
  case "$arg" in
    --webp) DO_WEBP=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

command -v magick >/dev/null || { echo "error: ImageMagick (magick) not found" >&2; exit 1; }
mkdir -p "$OUT_2X" "$OUT_1X"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Detect the window rectangle: echoes "L T W H".
detect_box() {
  local f="$1" W H cy cx L R T B
  W=$(identify -format "%w" "$f"); H=$(identify -format "%h" "$f")
  cy=$((H/2)); cx=$((W/2))
  read L R < <(
    magick "$f" -crop ${W}x1+0+${cy} +repage -depth 8 txt:- \
    | sed -nE 's/^([0-9]+),0: \(([0-9]+),([0-9]+),([0-9]+).*/\1 \2 \3 \4/p' \
    | awk -v t="$THRESH" 'NR==1{p=$2+$3+$4;next}{b=$2+$3+$4;d=b-p;if(d<0)d=-d;if(d>t){if(l=="")l=$1;r=$1}p=b}END{print l,r}'
  )
  read T B < <(
    magick "$f" -crop 1x${H}+${cx}+0 +repage -depth 8 txt:- \
    | sed -nE 's/^0,([0-9]+): \(([0-9]+),([0-9]+),([0-9]+).*/\1 \2 \3 \4/p' \
    | awk -v t="$THRESH" 'NR==1{p=$2+$3+$4;next}{b=$2+$3+$4;d=b-p;if(d<0)d=-d;if(d>t){if(tp=="")tp=$1;bt=$1}p=b}END{print tp,bt}'
  )
  echo "$L $T $((R-L)) $((B-T))"
}

shopt -s nullglob
FILES=("$DIR"/*.png)
[ ${#FILES[@]} -gt 0 ] || { echo "no source screenshots in $DIR" >&2; exit 1; }

# ── Pass 1: detect every window box, track the largest window size ───────────
declare -a NAMES BOXES
MAXW=0; MAXH=0
for f in "${FILES[@]}"; do
  box=$(detect_box "$f")
  read -r _l _t w h <<<"$box"
  NAMES+=("$(basename "$f")"); BOXES+=("$box")
  (( w > MAXW )) && MAXW=$w
  (( h > MAXH )) && MAXH=$h
  printf "detect  %-28s box=%s\n" "$(basename "$f")" "$box"
done

CW=$((MAXW + 2*BORDER)); CH=$((MAXH + 2*BORDER))
BG="$TMP/bg.png"
magick -size ${CW}x${CH} gradient:"${GRAD_TOP}"-"${GRAD_BOTTOM}" "$BG"
echo "canvas: ${CW}x${CH} (window ${MAXW}x${MAXH} + ${BORDER}px border)"

# ── Pass 2: crop, normalize size, shadow, frame, downscale ──────────────────
for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"; src="$DIR/$name"
  read -r L T W H <<<"${BOXES[$i]}"
  win="$TMP/win.png"; winsh="$TMP/winsh.png"
  # crop to the window, then pad to the common window size (centered)
  magick "$src" -crop ${W}x${H}+${L}+${T} +repage \
    -background none -gravity center -extent ${MAXW}x${MAXH} "$win"
  # symmetric shadow keeps the window centered
  magick "$win" \( +clone -background black -shadow "$SHADOW" \) +swap \
    -background none -layers merge +repage "$winsh"
  # frame on the uniform backdrop (opaque output, max PNG compression)
  magick "$BG" "$winsh" -gravity center -composite \
    -alpha off -strip -define png:compression-level=9 "$OUT_2X/$name"
  # 1x for README
  magick "$OUT_2X/$name" -resize "$SCALE" \
    -alpha off -strip -define png:compression-level=9 "$OUT_1X/$name"
  # optional lightweight WebP 1x
  if [ "$DO_WEBP" -eq 1 ]; then
    magick "$OUT_2X/$name" -resize "$SCALE" -strip \
      -quality "$WEBP_QUALITY" "$OUT_1X/${name%.png}.webp"
  fi
  printf "frame   %-28s -> normalized/%s\n" "$name" "$name"
done

echo
echo "=== 2x (normalized/) ==="
for f in "$OUT_2X"/*.png; do printf "  %-28s %s\n" "$(basename "$f")" "$(identify -format '%wx%h' "$f")"; done
echo "=== 1x png (normalized/1x/) ==="
for f in "$OUT_1X"/*.png; do printf "  %-28s %s\n" "$(basename "$f")" "$(identify -format '%wx%h' "$f")"; done
if [ "$DO_WEBP" -eq 1 ]; then
  echo "=== 1x webp (normalized/1x/) ==="
  for f in "$OUT_1X"/*.webp; do printf "  %-28s %-12s %s\n" "$(basename "$f")" "$(identify -format '%wx%h' "$f")" "$(du -h "$f" | cut -f1)"; done
fi
