#!/usr/bin/env python3
"""Prepare a roster bird sprite for FlappyTone.
Trims transparent margins, (optionally) removes floating junk pixels, squares the
canvas, exports a 512px WebP, and prints the normalized beakTip anchor
(rightmost opaque pixel) for src/game/characters.ts.

Usage:  python3 scripts/prep-bird.py <in.png> <id> [--clean]
Deps:   pip install pillow numpy scipy
Input MUST be a transparent PNG (RGBA). A white/black-flattened image is rejected.
Output: public/birds/<id>.webp  (move from here if you run it elsewhere)
"""
import sys, json, numpy as np
from PIL import Image
IN, ID = sys.argv[1], sys.argv[2]
CLEAN = "--clean" in sys.argv
SIZE = 512
im = Image.open(IN)
if im.mode != "RGBA" or "A" not in im.getbands():
    sys.exit(f"ERROR: {IN} has no alpha channel — export a TRANSPARENT PNG first.")
arr = np.array(im); a = arr[:, :, 3].copy()
if a.max() == 0: sys.exit("ERROR: fully transparent image.")
if CLEAN:
    from scipy import ndimage
    lbl, n = ndimage.label(a > 60)
    if n:
        keep = np.argmax(ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))) + 1
        a = np.where(lbl == keep, a, 0).astype(np.uint8); arr[:, :, 3] = a
ys, xs = np.where(a > 10)
crop = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
ch, cw = crop.shape[:2]; s = max(cw, ch)
sq = np.zeros((s, s, 4), np.uint8)
sq[(s - ch) // 2:(s - ch) // 2 + ch, (s - cw) // 2:(s - cw) // 2 + cw] = crop
aa = sq[:, :, 3]; ys2, xs2 = np.where(aa > 40)
bx = xs2.max(); by = int(ys2[xs2 == bx].mean())
beak = {"x": round(bx / s, 4), "y": round(by / s, 4)}
import os; os.makedirs("public/birds", exist_ok=True)
Image.fromarray(sq).resize((SIZE, SIZE), Image.LANCZOS).save(f"public/birds/{ID}.webp", "WEBP", quality=92, method=6)
print(json.dumps({"id": ID, "beakTip": beak, "nativePx": s}, indent=2))
print(f"-> public/birds/{ID}.webp")
