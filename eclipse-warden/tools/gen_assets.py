#!/usr/bin/env python3
"""Generates every texture of the mod and the boss model's cuboid layout.

The boss model and its texture share one part list (PARTS) so the UV layout can
never drift apart: this script packs the UVs, paints the texture and writes
WardenModelData.java. Run it again after changing PARTS or any painter.

    pip install pillow && python3 tools/gen_assets.py
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ASSETS = os.path.join(ROOT, 'src/main/resources/assets/eclipsewarden')
TEX = os.path.join(ASSETS, 'textures')
MODEL_JAVA = os.path.join(ROOT, 'src/client/java/com/eclipsewarden/client/model/WardenModelData.java')

# ---------------------------------------------------------------- palette
INK = (9, 6, 18)
P_DARK = (24, 18, 42)
P_MID = (46, 36, 78)
P_LITE = (80, 66, 124)
P_HI = (126, 110, 176)
GOLD_D = (120, 78, 22)
GOLD = (214, 158, 54)
GOLD_L = (255, 220, 122)
GLOW = (255, 246, 206)
VIO_D = (70, 32, 128)
VIO = (160, 92, 255)
VIO_L = (214, 172, 255)
CLOTH_HI = (70, 44, 112)
CLOTH_LO = (24, 16, 46)
EMBER = (255, 138, 52)


def h2(x, y, s=0):
    n = (int(x) * 374761393 + int(y) * 668265263 + int(s) * 2246822519) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def mix(a, b, t):
    t = clamp(t)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def mul(c, f):
    return tuple(max(0, min(255, int(round(c[i] * f)))) for i in range(3))


def vnoise(x, y, cell, seed, wrap=16):
    """Tiling bilinear value noise."""
    gx, gy = x / cell, y / cell
    x0, y0 = int(math.floor(gx)), int(math.floor(gy))
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    n = max(1, wrap // cell)
    v = lambda ix, iy: h2(ix % n, iy % n, seed)
    a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * fx
    b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * fx
    return a + (b - a) * fy


def new(w, h=None):
    return Image.new('RGBA', (w, h or w), (0, 0, 0, 0))


def save(img, rel):
    path = os.path.join(TEX, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def outline(img, color=INK):
    """Classic item-sprite outline: darken every transparent pixel touching an opaque one."""
    src = img.copy()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if src.getpixel((x, y))[3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src.getpixel((nx, ny))[3] > 200:
                    img.putpixel((x, y), color + (255,))
                    break
    return img


# ---------------------------------------------------------------- blocks
def tex_umbral_stone():
    img = new(16)
    for y in range(16):
        for x in range(16):
            n = 0.55 * vnoise(x, y, 4, 1) + 0.25 * vnoise(x, y, 8, 2) + 0.2 * h2(x, y, 3)
            c = mix(P_DARK, mix(P_MID, P_LITE, 0.25), n)
            if h2(x, y, 4) > 0.972:
                c = mix(c, VIO, 0.75)
            img.putpixel((x, y), c + (255,))
    for (sx, sy, seed) in ((2, 3, 11), (9, 10, 12), (12, 2, 13)):
        x, y = sx, sy
        for i in range(5):
            img.putpixel((x % 16, y % 16), mul(P_DARK, 0.7) + (255,))
            x += 1
            y += 1 if h2(i, seed, 5) > 0.45 else 0
    return img


def brick_px(x, y, lo, hi, seed):
    row = y // 4
    off = 0 if row % 2 == 0 else 4
    bx, by = (x + off) % 8, y % 4
    if bx == 7 or by == 3:
        return mul(P_DARK, 0.55)
    bid = ((x + off) // 8) % 2 + row * 2
    c = mix(lo, hi, 0.35 + 0.45 * h2(bid, 7, seed))
    c = mul(c, 0.93 + 0.14 * h2(x, y, seed + 1))
    if by == 0:
        c = mul(c, 1.22)
    if by == 2:
        c = mul(c, 0.84)
    if bx == 0:
        c = mul(c, 1.1)
    if bx == 6:
        c = mul(c, 0.86)
    return c


def tex_umbral_bricks():
    img = new(16)
    for y in range(16):
        for x in range(16):
            img.putpixel((x, y), brick_px(x, y, P_DARK, P_LITE, 21) + (255,))
    return img


def tile_px(x, y, size, lo, hi, seed):
    tx, ty = x % size, y % size
    if tx == size - 1 or ty == size - 1:
        return mul(P_DARK, 0.55)
    tid = (x // size) + 3 * (y // size)
    c = mix(lo, hi, 0.4 + 0.4 * h2(tid, 3, seed))
    c = mul(c, 0.94 + 0.12 * h2(x, y, seed + 1))
    if tx == 0 or ty == 0:
        c = mul(c, 1.2)
    if tx == size - 2 or ty == size - 2:
        c = mul(c, 0.82)
    return c


def tex_umbral_tiles():
    img = new(16)
    for y in range(16):
        for x in range(16):
            img.putpixel((x, y), tile_px(x, y, 8, P_MID, P_HI, 31) + (255,))
    return img


def tex_gilded_tiles():
    img = new(16)
    for y in range(16):
        for x in range(16):
            c = tile_px(x, y, 16, P_MID, P_LITE, 41)
            ring = max(abs(x - 7), abs(y - 7)) if x <= 7 or y <= 7 else max(abs(x - 7), abs(y - 7))
            edge = min(x, y, 14 - x, 14 - y)
            if edge == 2:
                c = GOLD_L if (x <= 7 and y <= 7) or (x + y < 13) else GOLD_D
                if x in (2, 12) and y in (2, 12):
                    c = GLOW
            elif edge == 3:
                c = mul(c, 0.7)
            d = abs(x - 7) + abs(y - 7)
            if d <= 2:
                c = GOLD if d == 2 else (GOLD_L if d == 1 else GLOW)
            elif d == 3:
                c = GOLD_D
            img.putpixel((x, y), c + (255,))
    return img


def eclipse_glyph(img, cx, cy, r, bright):
    """Dark disc with a gold corona; the mod's recurring motif."""
    w, h = img.size
    for y in range(h):
        for x in range(w):
            d = math.hypot(x - cx, y - cy)
            lit = (cx - x) + (cy - y) > 0
            if d < r - 1.05:
                c = mix(INK, VIO_D, 0.25 if not bright else 0.6)
                if bright and d < 1.3:
                    c = VIO_L
            elif d < r + 0.35:
                c = (GLOW if lit else GOLD_L) if bright else (GOLD_L if lit else GOLD)
            elif d < r + 1.2:
                c = (GOLD_L if bright else GOLD_D)
                if not bright and not lit:
                    continue
            else:
                continue
            img.putpixel((x, y), c + (255,))


def tex_chiseled():
    img = new(16)
    for y in range(16):
        for x in range(16):
            c = tile_px(x, y, 16, P_DARK, P_MID, 51)
            e = min(x, y, 14 - x, 14 - y)
            if e == 1:
                c = mul(c, 0.7)
            img.putpixel((x, y), c + (255,))
    eclipse_glyph(img, 7, 7, 4.2, False)
    for (x, y) in ((2, 2), (12, 2), (2, 12), (12, 12)):
        img.putpixel((x, y), GOLD + (255,))
    for (x, y) in ((7, 1), (7, 13), (1, 7), (13, 7)):
        img.putpixel((x, y), VIO + (255,))
    return img


def tex_pillar_side():
    img = new(16)
    shade = (0.55, 1.2, 1.0, 0.8)
    for y in range(16):
        for x in range(16):
            c = mix(P_MID, P_LITE, 0.5)
            c = mul(c, shade[x % 4] * (0.95 + 0.1 * h2(x, y, 61)))
            if y == 15:
                c = mul(c, 0.6)
            if y == 0:
                c = mul(c, 1.12)
            img.putpixel((x, y), c + (255,))
    return img


def tex_pillar_top():
    img = new(16)
    for y in range(16):
        for x in range(16):
            c = tile_px(x, y, 16, P_MID, P_LITE, 71)
            d = math.hypot(x - 7, y - 7)
            if 4.4 < d < 5.6:
                c = mul(c, 0.6)
            elif d < 2.2:
                c = GOLD if d > 1.2 else GOLD_L
            img.putpixel((x, y), c + (255,))
    return img


def tex_lantern():
    img = new(16)
    for y in range(16):
        for x in range(16):
            e = min(x, y, 15 - x, 15 - y)
            if e < 2:
                c = mul(P_MID, 0.8 + 0.3 * h2(x, y, 81))
                if e == 0:
                    c = mul(c, 0.7)
                if (x < 3 or x > 12) and (y < 3 or y > 12):
                    c = GOLD if e == 1 else GOLD_D
            else:
                d = math.hypot(x - 7.5, y - 7.5) / 7.5
                c = mix(GLOW, EMBER, clamp(d * 1.25 - 0.1))
                c = mix(c, GOLD_L, 0.25 * h2(x, y, 82))
                if x in (7, 8) or y in (7, 8):
                    c = mix(c, GOLD_D, 0.55) if e > 2 else GOLD_D
            img.putpixel((x, y), c + (255,))
    return img


def tex_altar_side():
    img = new(16)
    for y in range(16):
        for x in range(16):
            c = brick_px(x, (y + 2) % 16, P_DARK, P_MID, 91)
            if y in (10, 13):
                c = GOLD_D if y == 13 else GOLD
            if 10 < y < 13:
                c = mul(P_DARK, 0.8)
                if (x + y) % 4 == 0:
                    c = VIO
                elif (x - y) % 4 == 1:
                    c = GOLD_L
            img.putpixel((x, y), c + (255,))
    return img


def tex_altar_top(active):
    img = new(16)
    for y in range(16):
        for x in range(16):
            c = tile_px(x, y, 16, P_DARK, P_MID, 101)
            e = min(x, y, 15 - x, 15 - y)
            if e == 1:
                c = GOLD if (x + y) < 15 else GOLD_D
            img.putpixel((x, y), c + (255,))
    eclipse_glyph(img, 7.5, 7.5, 4.6, active)
    for (x, y) in ((3, 3), (12, 3), (3, 12), (12, 12)):
        img.putpixel((x, y), (GLOW if active else VIO) + (255,))
    if active:
        for i in range(2, 14):
            for (x, y) in ((i, 7), (i, 8), (7, i), (8, i)):
                if math.hypot(x - 7.5, y - 7.5) > 5.6:
                    img.putpixel((x, y), GOLD_L + (255,))
    return img


def tex_altar_gold():
    img = new(16)
    for y in range(16):
        for x in range(16):
            c = mix(GOLD_L, GOLD_D, (x + y) / 30 + 0.15 * h2(x, y, 111))
            img.putpixel((x, y), c + (255,))
    return img


# ---------------------------------------------------------------- items
def item_core():
    img = new(16)
    for y in range(16):
        for x in range(16):
            dx, dy = x - 7.5, y - 7.5
            d = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            flare = 0.5 + 0.5 * math.sin(ang * 4)
            if d < 3.9:
                c = mix(INK, VIO_D, clamp((-dx - dy) / 7 + 0.1))
            elif d < 5.0:
                c = GLOW if (dx + dy) < 1 else GOLD_L
            elif d < 6.1:
                c = GOLD_L if flare > 0.4 else GOLD
            elif d < 7.4 and flare > 0.72:
                c = EMBER if d > 6.7 else GOLD
            else:
                continue
            img.putpixel((x, y), c + (255,))
    return img


def item_sigil():
    img = new(16)
    for y in range(16):
        for x in range(16):
            dx, dy = x - 7.5, y - 7.5
            d = math.hypot(dx, dy)
            if d > 6.6:
                continue
            if d > 5.0:
                c = mix(GOLD_L, GOLD_D, clamp((dx + dy) / 10 + 0.5))
            else:
                c = mix(P_MID, P_DARK, clamp((dx + dy) / 8 + 0.5))
                moon = math.hypot(dx, dy) < 3.4 and math.hypot(dx - 1.5, dy + 1.0) > 2.9
                if moon:
                    c = VIO_L if dx + dy < 0 else VIO
            img.putpixel((x, y), c + (255,))
    img.putpixel((9, 6), GLOW + (255,))
    return outline(img)


def item_shard():
    img = new(16)
    d = ImageDraw.Draw(img)
    d.polygon([(9, 1), (12, 5), (9, 14), (4, 11), (6, 5)], fill=VIO + (255,))
    for y in range(16):
        for x in range(16):
            if img.getpixel((x, y))[3] == 0:
                continue
            t = clamp((x * 0.9 + y * 0.6 - 6) / 13)
            c = mix(VIO_L, VIO_D, t)
            if x + y in (13, 14) and y > 3:
                c = mix(c, GLOW, 0.5)
            if x - y == 5 or (x == 7 and 5 < y < 12):
                c = mix(c, INK, 0.35)
            img.putpixel((x, y), c + (255,))
    img.putpixel((8, 3), GLOW + (255,))
    return outline(img)


CROWN = [
    "................",
    "................",
    ".......L........",
    "...L...G...L....",
    "...G..GLG..G....",
    "..GLG.GLG.GLG...",
    "..GLG.GVG.GLG...",
    "..GLGGVWVGGLG...",
    "..GLLLGVGLLLG...",
    "..GDDDGGGDDDG...",
    "..GDPDDDDDPDG...",
    "..gDDDDDDDDDg...",
    "...ggggggggg....",
    "................",
    "................",
    "................",
]


def item_crown():
    key = {'L': GOLD_L, 'G': GOLD, 'g': GOLD_D, 'V': VIO, 'W': GLOW, 'D': P_MID, 'P': VIO_L}
    img = new(16)
    for y, row in enumerate(CROWN):
        for x, ch in enumerate(row):
            if ch in key:
                img.putpixel((x, y), key[ch] + (255,))
    return outline(img)


def item_blade():
    """32x32 greatsword on the usual handheld diagonal."""
    img = new(32)
    ax, ay, bx, by = 3.0, 28.0, 29.5, 1.5
    length = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / length, (by - ay) / length
    for y in range(32):
        for x in range(32):
            rx, ry = x - ax, y - ay
            t = (rx * ux + ry * uy) / length
            p = rx * -uy + ry * ux  # signed distance from the axis
            c = None
            if -0.02 <= t < 0.06 and abs(p) < 1.6:
                c = GOLD_L if p < 0 else GOLD_D
            elif 0.06 <= t < 0.2 and abs(p) < 1.0:
                c = GOLD if int(t * length) % 3 == 0 else mix(P_DARK, VIO_D, 0.4)
            elif 0.2 <= t < 0.255 and abs(p) < 6.2 - abs(t - 0.2275) * 30:
                c = GOLD_L if p < -1 else (GOLD if p < 2.5 else GOLD_D)
                if abs(p) > 4.6:
                    c = GLOW
            elif 0.255 <= t <= 1.0:
                half = 2.7 if t < 0.84 else 2.7 * (1.0 - t) / 0.16
                if abs(p) <= half:
                    if abs(p) < 0.6 and t < 0.86:
                        c = VIO if int(t * length) % 4 else GLOW
                    elif p < 0:
                        c = mix(GLOW, (228, 214, 255), clamp(-p / 3 * 0.4))
                    else:
                        c = mix((196, 176, 240), (150, 120, 214), clamp(p / 2.7))
                    if abs(p) > half - 0.75:
                        c = GLOW if p < 0 else GOLD_L
            if c:
                img.putpixel((x, y), c + (255,))
    # eclipse set into the guard
    gx, gy = ax + ux * length * 0.2275, ay + uy * length * 0.2275
    for y in range(32):
        for x in range(32):
            d = math.hypot(x - gx, y - gy)
            if d < 1.3:
                img.putpixel((x, y), INK + (255,))
            elif d < 2.3:
                img.putpixel((x, y), GLOW + (255,))
    return outline(img)


def item_scepter():
    img = new(16)
    for i in range(9):
        x, y = 2 + i, 13 - i
        for (ox, oy) in ((0, 0), (1, 0)):
            c = mix(P_LITE, P_DARK, 0.3 + 0.5 * oy + 0.4 * ox)
            if i in (1, 5):
                c = GOLD
            img.putpixel((x + ox, y + oy), c + (255,))
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 11.5, y - 4.0)
            if d < 2.5:
                c = mix(GLOW, VIO, clamp(d / 2.5 + (x - 11.5 + y - 4.0) / 8))
                img.putpixel((x, y), c + (255,))
    for (x, y, c) in ((9, 6, GOLD), (9, 5, GOLD_L), (10, 7, GOLD), (11, 7, GOLD_D), (13, 1, GOLD_L),
                      (14, 2, GOLD), (9, 2, GOLD), (14, 6, GOLD_D)):
        img.putpixel((x, y), c + (255,))
    return outline(img)


# ---------------------------------------------------------------- particles & effects
def particle_spark(frame):
    img = new(8)
    arm = 3 - frame
    for y in range(8):
        for x in range(8):
            dx, dy = abs(x - 3.5), abs(y - 3.5)
            if dx < 1 and dy < 1 and frame < 3:
                img.putpixel((x, y), (255, 255, 255, 255))
            elif (dx < 1 and dy <= arm + 0.5) or (dy < 1 and dx <= arm + 0.5):
                far = max(dx, dy) / 3.5
                img.putpixel((x, y), mix(GLOW, GOLD, far) + (int(255 * (1 - 0.5 * far)),))
            elif frame == 0 and dx < 2 and dy < 2:
                img.putpixel((x, y), GOLD_L + (150,))
    return img


def particle_wisp(frame):
    img = new(8)
    r = 3.6 - frame * 0.7
    for y in range(8):
        for x in range(8):
            d = math.hypot(x - 3.5, y - 3.5)
            if d <= r:
                t = d / r
                img.putpixel((x, y), mix(VIO_L, VIO_D, t) + (int(230 * (1 - t * t)),))
    return img


def effect_bolt():
    img = new(32)
    for y in range(32):
        for x in range(32):
            dx, dy = x - 15.5, y - 15.5
            d = math.hypot(dx, dy) / 15.5
            star = max(0.0, 1 - abs(dx) * abs(dy) / 6.0) * max(0.0, 1 - d)
            core = max(0.0, 1 - d * 2.4)
            halo = max(0.0, 1 - d) ** 2
            a = clamp(core * 1.5 + halo * 0.8 + star * 0.9)
            c = mix(VIO, (255, 255, 255), clamp(core * 1.6 + star * 0.6))
            if a > 0.02:
                img.putpixel((x, y), c + (int(255 * a),))
    return img


def effect_slash():
    """Crescent seen from above; the leading edge is the top of the image."""
    img = new(64, 32)
    for y in range(32):
        for x in range(64):
            outer = math.hypot(x - 31.5, y - 44) - 42
            inner = math.hypot(x - 31.5, y - 52) - 44
            if outer > 0 or inner < 0:
                continue
            edge = clamp(-outer / 3.0)
            tail = clamp(inner / 9.0)
            side = clamp(1 - abs(x - 31.5) / 31.5)
            a = clamp(min(edge, 1.0) * (1 - tail * 0.75) * (0.35 + side))
            c = mix(GLOW, VIO, clamp(tail * 1.3))
            if -outer < 2.2:
                c = (255, 255, 255)
            img.putpixel((x, y), c + (int(255 * a),))
    return img


def sky_corona(size=256):
    """Additive solar corona; the renderer draws the black disc on top."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    r0 = 0.22
    for y in range(size):
        for x in range(size):
            dx, dy = (x - size / 2 + 0.5) / (size / 2), (y - size / 2 + 0.5) / (size / 2)
            d = math.hypot(dx, dy)
            if d < r0 - 0.012:
                continue
            ang = math.atan2(dy, dx)
            streamers = (0.55 + 0.25 * math.sin(ang * 6 + 0.7) + 0.2 * math.sin(ang * 13 + 2.1)
                         + 0.18 * math.sin(ang * 29 + 0.3) + 0.25 * max(0.0, math.cos(ang - 0.9)) ** 8)
            fall = math.exp(-max(0.0, d - r0) * (7.5 - 3.0 * clamp(streamers)))
            ring = math.exp(-((d - r0) / 0.018) ** 2)
            bead = math.exp(-(((dx - r0 * 0.64) ** 2 + (dy + r0 * 0.77) ** 2) / 0.0009))
            i = clamp(fall * (0.35 + 0.65 * clamp(streamers)) * clamp((1 - d) * 3) + ring + bead)
            c = mix((150, 70, 255), (255, 232, 170), clamp(i * 1.7))
            c = mix(c, (255, 255, 255), clamp(ring + bead))
            img.putpixel((x, y), mul(c, i) + (255,))
    return img


def armor_layer():
    """Vanilla 64x32 armor sheet; only the helmet box is painted, as a spiked crown."""
    img = new(64, 32)
    sides = {'right': (0, 8), 'front': (8, 8), 'left': (16, 8), 'back': (24, 8)}
    for name, (ox, oy) in sides.items():
        for x in range(8):
            for y in range(8):
                c = None
                if y in (2, 3, 4):
                    c = (GOLD_L, GOLD, GOLD_D)[y - 2]
                    if x % 2 == 1 and y == 3:
                        c = GOLD_L
                elif y == 1 and x % 2 == 0:
                    c = GOLD
                elif y == 0 and x in (0, 4):
                    c = GOLD_L
                if name == 'front' and x in (3, 4):
                    if y in (2, 3):
                        c = VIO if y == 3 else VIO_L
                    elif y in (0, 1):
                        c = GOLD_L
                if c:
                    img.putpixel((ox + x, oy + y), c + (255,))
    return img


def icon():
    base = sky_corona(128)
    img = Image.new('RGBA', (128, 128), (12, 8, 24, 255))
    for y in range(128):
        for x in range(128):
            r, g, b, _ = base.getpixel((x, y))
            br, bg, bb, _ = img.getpixel((x, y))
            img.putpixel((x, y), (min(255, br + r), min(255, bg + g), min(255, bb + b), 255))
    return img


# ---------------------------------------------------------------- boss model
def box(name, x, y, z, w, h, d, mat, dil=0.0, share=None):
    if d == 0:
        # pull a flat plane's two faces slightly apart so they do not z-fight
        dil = 0.05
    return dict(name=name, x=x, y=y, z=z, w=w, h=h, d=d, mat=mat, dil=dil, share=share)


# (bone, parent, pivot, rotation in degrees, cuboids). Pivots are relative to the parent bone.
PARTS = [
    ('waist', 'root', (0, -2, 0), (0, 0, 0), []),
    ('robe_top', 'waist', (0, 0, 0), (0, 0, 0), [box('robe1', -6.5, 0, -3.5, 13, 8, 7, 'robe')]),
    ('robe_mid', 'robe_top', (0, 8, 0), (0, 0, 0), [box('robe2', -5.5, 0, -3, 11, 8, 6, 'robe')]),
    ('robe_low', 'robe_mid', (0, 8, 0), (0, 0, 0), [box('robe3', -4, 0, -2, 8, 8, 4, 'tatter')]),
    ('tasset_right', 'waist', (-6.5, -1, 0), (0, 0, 14), [box('tasset', -2, 0, -3.5, 3, 10, 7, 'tasset')]),
    ('tasset_left', 'waist', (6.5, -1, 0), (0, 0, -14), [box('tasset_l', -1, 0, -3.5, 3, 10, 7, 'tasset', share='tasset')]),
    ('torso', 'waist', (0, 0, 0), (0, 0, 0), [
        box('chest', -6, -16, -3.5, 12, 16, 7, 'chest'),
        box('chestplate', -7.5, -17, -4.5, 15, 9, 9, 'chestplate'),
        box('belt', -6.5, -2, -4, 13, 2, 8, 'belt'),
        box('gem', -2, -14.5, -5.5, 4, 4, 1, 'gem'),
    ]),
    ('head', 'torso', (0, -17, 0), (0, 0, 0), [box('helm', -4.5, -9, -4.5, 9, 9, 9, 'helm')]),
    ('horn_right', 'head', (-4.5, -7, 0), (0, 0, -24), [box('horn', -2, -8, -1, 2, 9, 2, 'horn')]),
    ('horn_left', 'head', (4.5, -7, 0), (0, 0, 24), [box('horn_l', 0, -8, -1, 2, 9, 2, 'horn', share='horn')]),
    ('halo', 'torso', (0, -22, 6.5), (0, 0, 0), [box('halo', -12, -12, 0, 24, 24, 0, 'halo')]),
    ('cape', 'torso', (0, -16, 4.6), (6, 0, 0), [box('cape', -7.5, 0, 0, 15, 30, 0, 'cape')]),
    ('wing_right_upper', 'torso', (-3, -13, 5), (0, 20, 38), [box('wing', -20, -2.5, 0, 20, 5, 0, 'wing')]),
    ('wing_right_lower', 'torso', (-3, -9, 5), (0, 20, -8), [box('wing_b', -20, -2.5, 0, 20, 5, 0, 'wing', share='wing')]),
    ('wing_left_upper', 'torso', (3, -13, 5), (0, -20, -38), [box('wing_c', 0, -2.5, 0, 20, 5, 0, 'wing', share='wing')]),
    ('wing_left_lower', 'torso', (3, -9, 5), (0, -20, 8), [box('wing_d', 0, -2.5, 0, 20, 5, 0, 'wing', share='wing')]),
    ('right_arm', 'torso', (-9, -14, 0), (-12, 0, 10), [
        box('pauldron', -5, -3.5, -4, 7, 6, 8, 'pauldron'),
        box('upper_arm', -4, 2.5, -2.5, 5, 9, 5, 'arm'),
    ]),
    ('right_forearm', 'right_arm', (-1.5, 11.5, 0), (-38, 0, 0), [box('gauntlet', -2.5, 0, -2.5, 5, 10, 5, 'gauntlet', 0.25)]),
    ('sword', 'right_forearm', (0, 8.5, 0), (-82, 0, 0), [
        box('grip', -1, -5, -1, 2, 10, 2, 'grip'),
        box('pommel', -1.5, -7, -1.5, 3, 2, 3, 'guard'),
        box('guard', -1.5, 5, -5, 3, 2, 10, 'guard'),
        box('blade', -0.5, 7, -2.5, 1, 30, 5, 'blade'),
    ]),
    ('left_arm', 'torso', (9, -14, 0), (-8, 0, -10), [
        box('pauldron_l', -2, -3.5, -4, 7, 6, 8, 'pauldron', share='pauldron'),
        box('upper_arm_l', -1, 2.5, -2.5, 5, 9, 5, 'arm', share='upper_arm'),
    ]),
    ('left_forearm', 'left_arm', (1.5, 11.5, 0), (-30, 0, 0), [box('gauntlet_l', -2.5, 0, -2.5, 5, 10, 5, 'gauntlet', 0.25, share='gauntlet')]),
    ('orb', 'left_forearm', (0, 14, 0), (0, 0, 0), [box('orb', -2, -2, -2, 4, 4, 4, 'orb')]),
]
TEX_W, TEX_H = 128, 128


def pack(parts):
    """Shelf-packs every unshared cuboid's unfolded box onto the sheet."""
    boxes = [b for p in parts for b in p[4] if not b['share']]
    order = sorted(boxes, key=lambda b: -(b['d'] + b['h']))
    x = y = shelf = 0
    for b in order:
        w, h = 2 * (b['d'] + b['w']), b['d'] + b['h']
        if x + w > TEX_W:
            x, y, shelf = 0, y + shelf + 1, 0
        if y + h > TEX_H:
            raise SystemExit('boss texture sheet is full')
        b['u'], b['v'] = x, y
        x += w + 1
        shelf = max(shelf, h)
    by_name = {b['name']: b for b in boxes}
    for p in parts:
        for b in p[4]:
            if b['share']:
                b['u'], b['v'] = by_name[b['share']]['u'], by_name[b['share']]['v']
    return boxes


def faces(b):
    u, v, w, h, d = b['u'], b['v'], b['w'], b['h'], b['d']
    return {
        'top': (u + d, v, w, d), 'bottom': (u + d + w, v, w, d),
        'right': (u, v + d, d, h), 'front': (u + d, v + d, w, h),
        'left': (u + d + w, v + d, d, h), 'back': (u + d + w + d, v + d, w, h),
    }


class Sheet:
    def __init__(self):
        self.img = new(TEX_W, TEX_H)
        self.glow = new(TEX_W, TEX_H)

    def put(self, x, y, c, a=255, glow=0.0):
        self.img.putpixel((x, y), tuple(c) + (a,))
        self.glow.putpixel((x, y), (mul(c, glow) + (255,)) if glow > 0 else (0, 0, 0, 0))


def plate(s, r, hi, lo, seed, rim=True):
    x0, y0, w, h = r
    for j in range(h):
        for i in range(w):
            c = mix(hi, lo, j / max(1, h - 1))
            c = mul(c, 0.9 + 0.2 * h2(x0 + i, y0 + j, seed))
            if rim and (i == 0 or j == 0):
                c = mul(c, 1.28)
            if rim and (i == w - 1 or j == h - 1) and w > 1 and h > 1:
                c = mul(c, 0.62)
            s.put(x0 + i, y0 + j, c)


def cloth(s, r, seed, hem=False, tatter=False, emblem=False, trim=False):
    x0, y0, w, h = r
    for i in range(w):
        cut = int(h2(i, seed, 7) * 5) if tatter else 0
        for j in range(h):
            if tatter and j >= h - cut:
                s.put(x0 + i, y0 + j, (0, 0, 0), 0)
                continue
            c = mix(CLOTH_HI, CLOTH_LO, j / max(1, h - 1) * 0.9 + 0.05)
            c = mul(c, 0.82 + 0.22 * math.sin(i * 1.45 + seed) ** 2 + 0.08 * h2(i, j, seed))
            if hem and j >= h - 2:
                c = GOLD if j == h - 2 else GOLD_D
            if trim and (i == 0 or i == w - 1):
                c = GOLD_D
            if tatter and j >= h - cut - 1:
                c = mul(c, 0.6)
            s.put(x0 + i, y0 + j, c)
    if emblem:
        cx, cy = x0 + w // 2, y0 + 9
        for j in range(-5, 6):
            for i in range(-5, 6):
                d = math.hypot(i, j)
                if 2.6 < d < 4.1:
                    s.put(cx + i, cy + j, GOLD_L if i + j < 0 else GOLD, glow=0.55)
                elif d <= 2.6:
                    s.put(cx + i, cy + j, INK)


def paint(s, b):
    f = faces(b)
    mat, seed = b['mat'], sum(map(ord, b['name']))
    for name, r in f.items():
        x0, y0, w, h = r
        if w == 0 or h == 0:
            continue
        if mat == 'chest':
            plate(s, r, P_MID, P_DARK, seed)
            if name not in ('top', 'bottom'):
                for j in range(3, h, 4):
                    for i in range(w):
                        s.put(x0 + i, y0 + j, mul(P_DARK, 0.6))
        elif mat == 'chestplate':
            plate(s, r, P_HI, P_MID, seed)
            if name in ('front', 'back', 'left', 'right'):
                for i in range(w):
                    s.put(x0 + i, y0 + h - 1, GOLD_D)
                    s.put(x0 + i, y0 + h - 2, GOLD)
                    s.put(x0 + i, y0, GOLD_L)
            if name == 'front':
                for j in range(h):
                    s.put(x0, y0 + j, GOLD)
                    s.put(x0 + w - 1, y0 + j, GOLD_D)
                for i in range(w):
                    for j in range(1, h - 2):
                        if abs(i - w // 2) == j + 1:
                            s.put(x0 + i, y0 + j, GOLD)
        elif mat == 'belt':
            plate(s, r, GOLD_L, GOLD_D, seed)
            if name not in ('top', 'bottom'):
                for i in range(1, w, 3):
                    s.put(x0 + i, y0, GLOW, glow=0.3)
        elif mat == 'gem':
            for j in range(h):
                for i in range(w):
                    edge = i in (0, w - 1) or j in (0, h - 1)
                    c = VIO_D if edge else (VIO_L if (i, j) == (1, 1) else VIO)
                    if name != 'front':
                        c = GOLD
                    s.put(x0 + i, y0 + j, c, glow=0.8 if name == 'front' and not edge else 0.0)
        elif mat == 'helm':
            plate(s, r, P_HI, P_MID, seed)
            if name == 'top':
                for j in range(h):
                    s.put(x0 + w // 2, y0 + j, GOLD_L)
                for i in range(w):
                    s.put(x0 + i, y0 + h - 1, GOLD)
            elif name != 'bottom':
                for i in range(w):
                    s.put(x0 + i, y0 + h - 1, GOLD_D)
                    s.put(x0 + i, y0, GOLD)
            if name == 'front':
                for j in range(0, 3):
                    s.put(x0 + w // 2, y0 + j, GOLD_L)
                for j in range(3, 6):
                    for i in range(1, w - 1):
                        s.put(x0 + i, y0 + j, INK)
                for i in (2, 3, 5, 6):
                    s.put(x0 + i, y0 + 4, GLOW, glow=1.0)
                s.put(x0 + 1, y0 + 4, GOLD, glow=0.5)
                s.put(x0 + 7, y0 + 4, GOLD, glow=0.5)
                for i in (2, 4, 6):
                    for j in (6, 7):
                        s.put(x0 + i, y0 + j, P_DARK)
        elif mat == 'horn':
            for j in range(h):
                for i in range(w):
                    c = mix(GLOW, GOLD_D, j / (h - 1))
                    s.put(x0 + i, y0 + j, mul(c, 1.0 if i == 0 else 0.8), glow=0.5 if j < 2 else 0.0)
        elif mat == 'pauldron':
            plate(s, r, P_HI, P_MID, seed)
            if name == 'top':
                for i in range(w):
                    for j in range(h):
                        if i in (0, w - 1) or j in (0, h - 1):
                            s.put(x0 + i, y0 + j, GOLD)
                s.put(x0 + w // 2, y0 + h // 2, GLOW, glow=0.6)
            elif name != 'bottom':
                for i in range(w):
                    s.put(x0 + i, y0 + h - 1, GOLD_D)
                    s.put(x0 + i, y0 + h - 2, GOLD_L)
                    s.put(x0 + i, y0, GOLD)
        elif mat == 'arm':
            plate(s, r, P_MID, P_DARK, seed)
            if name not in ('top', 'bottom'):
                for i in range(w):
                    s.put(x0 + i, y0 + 4, mul(P_DARK, 0.6))
        elif mat == 'gauntlet':
            plate(s, r, P_LITE, P_MID, seed)
            if name not in ('top', 'bottom'):
                for i in range(w):
                    s.put(x0 + i, y0, GOLD_L)
                    s.put(x0 + i, y0 + 1, GOLD_D)
                    s.put(x0 + i, y0 + h - 3, GOLD)
                s.put(x0 + w // 2, y0 + 4, VIO, glow=0.9)
        elif mat == 'orb':
            for j in range(h):
                for i in range(w):
                    edge = i in (0, w - 1) or j in (0, h - 1)
                    s.put(x0 + i, y0 + j, VIO if edge else GLOW, glow=1.0)
        elif mat == 'grip':
            for j in range(h):
                for i in range(w):
                    c = GOLD if j % 3 == 0 else mix(P_DARK, VIO_D, 0.35)
                    s.put(x0 + i, y0 + j, c)
        elif mat == 'guard':
            plate(s, r, GOLD_L, GOLD_D, seed)
        elif mat == 'blade':
            for j in range(h):
                for i in range(w):
                    tip = h - 1 - j if name in ('left', 'right') else 99
                    if name in ('left', 'right') and abs(i - w // 2) > tip + 0.5:
                        s.put(x0 + i, y0 + j, (0, 0, 0), 0)
                    elif name in ('left', 'right') and i == w // 2 and j < h - 4:
                        rune = j % 5 == 2
                        s.put(x0 + i, y0 + j, GLOW if rune else VIO, glow=1.0 if rune else 0.45)
                    elif name in ('left', 'right') and 0 < i < w - 1:
                        s.put(x0 + i, y0 + j, mix((236, 226, 255), (176, 156, 226), j / h), glow=0.12)
                    else:
                        s.put(x0 + i, y0 + j, GLOW, glow=0.85)
        elif mat == 'robe':
            if name in ('top', 'bottom'):
                plate(s, r, CLOTH_LO, CLOTH_LO, seed, rim=False)
            else:
                cloth(s, r, seed + len(name), hem=True)
        elif mat == 'tatter':
            if name in ('top', 'bottom'):
                plate(s, r, CLOTH_LO, INK, seed, rim=False)
            else:
                cloth(s, r, seed + len(name), tatter=True)
        elif mat == 'tasset':
            plate(s, r, P_LITE, P_MID, seed)
            if name not in ('top', 'bottom'):
                for i in range(w):
                    s.put(x0 + i, y0 + h - 1, GOLD_D)
                    s.put(x0 + i, y0 + h - 2, GOLD_L)
                if w > 3:
                    s.put(x0 + w // 2, y0 + 3, GOLD)
        elif mat == 'cape':
            cloth(s, r, 4, tatter=True, emblem=True, trim=True)
        elif mat == 'halo':
            for j in range(h):
                for i in range(w):
                    dx, dy = i - (w - 1) / 2, j - (h - 1) / 2
                    d = math.hypot(dx, dy)
                    ang = math.atan2(dy, dx)
                    spike = abs(math.sin(ang * 4)) < 0.16
                    if 8.6 < d < 10.4:
                        s.put(x0 + i, y0 + j, GLOW if d < 9.6 else GOLD_L, glow=1.0)
                    elif 10.4 <= d < 12.2 and spike:
                        s.put(x0 + i, y0 + j, GOLD_L, glow=0.9)
                    elif 6.3 < d < 7.1 and int((ang + math.pi) * 6 / math.pi) % 2 == 0:
                        s.put(x0 + i, y0 + j, VIO_L, 220, glow=0.8)
        elif mat == 'wing':
            for j in range(h):
                for i in range(w):
                    k = i if name == 'front' else w - 1 - i  # k == 0 is the tip
                    half = 0.3 + 2.3 * min(1.0, k / 9.0)
                    off = abs(j - (h - 1) / 2)
                    if off > half:
                        continue
                    edge = off > half - 1.0
                    c = GLOW if edge else mix(VIO_L, VIO, k / w)
                    s.put(x0 + i, y0 + j, c, glow=0.9 if edge else 0.5)
    # a zero-depth plane shows both faces at once, so the back must mirror the front
    if b['d'] == 0:
        fx, fy, fw, fh = f['front']
        bx, by, _, _ = f['back']
        for img in (s.img, s.glow):
            region = img.crop((fx, fy, fx + fw, fy + fh)).transpose(Image.FLIP_LEFT_RIGHT)
            img.paste(region, (bx, by))


def fnum(v):
    return ('%sF' % (int(v) if float(v).is_integer() else v))


def write_model_java(parts):
    lines = [
        'package com.eclipsewarden.client.model;', '',
        'import net.minecraft.client.model.Dilation;',
        'import net.minecraft.client.model.ModelData;',
        'import net.minecraft.client.model.ModelPartBuilder;',
        'import net.minecraft.client.model.ModelPartData;',
        'import net.minecraft.client.model.ModelTransform;',
        'import net.minecraft.client.model.TexturedModelData;', '',
        '/** Generated by tools/gen_assets.py together with the boss texture. Do not edit by hand. */',
        'public final class WardenModelData {',
        '\tprivate WardenModelData() {', '\t}', '',
        '\tpublic static TexturedModelData create() {',
        '\t\tModelData modelData = new ModelData();',
        '\t\tModelPartData root = modelData.getRoot();',
    ]
    rad = math.pi / 180
    for bone, parent, pivot, rot, boxes in parts:
        b = 'ModelPartBuilder.create()'
        for c in boxes:
            mirrored = bool(c['share'])
            b += '\n\t\t\t\t.uv(%d, %d)%s.cuboid(%s, %s, %s, %s, %s, %s, new Dilation(%s))%s' % (
                c['u'], c['v'], '.mirrored()' if mirrored else '',
                fnum(c['x']), fnum(c['y']), fnum(c['z']), fnum(c['w']), fnum(c['h']), fnum(c['d']), fnum(c['dil']),
                '.mirrored(false)' if mirrored else '')
        py = pivot[1] + (24 if parent == 'root' else 0)
        lines.append('\t\tModelPartData %s = %s.addChild("%s", %s,\n\t\t\t\tModelTransform.of(%s, %s, %s, %sF, %sF, %sF));' % (
            camel(bone), camel(parent), bone, b, fnum(pivot[0]), fnum(py), fnum(pivot[2]),
            round(rot[0] * rad, 5), round(rot[1] * rad, 5), round(rot[2] * rad, 5)))
    lines += ['\t\treturn TexturedModelData.of(modelData, %d, %d);' % (TEX_W, TEX_H), '\t}', '}', '']
    os.makedirs(os.path.dirname(MODEL_JAVA), exist_ok=True)
    with open(MODEL_JAVA, 'w') as fh:
        fh.write('\n'.join(lines))


def camel(name):
    head, *rest = name.split('_')
    return head + ''.join(p.title() for p in rest)


def boss():
    boxes = pack(PARTS)
    sheet = Sheet()
    for b in boxes:
        paint(sheet, b)
    save(sheet.img, 'entity/eclipse_warden.png')
    save(sheet.glow, 'entity/eclipse_warden_glow.png')
    write_model_java(PARTS)


def main():
    for name, img in {
        'umbral_stone': tex_umbral_stone(), 'umbral_bricks': tex_umbral_bricks(), 'umbral_tiles': tex_umbral_tiles(),
        'gilded_umbral_tiles': tex_gilded_tiles(), 'chiseled_umbral_bricks': tex_chiseled(),
        'umbral_pillar': tex_pillar_side(), 'umbral_pillar_top': tex_pillar_top(), 'eclipse_lantern': tex_lantern(),
        'eclipse_altar_side': tex_altar_side(), 'eclipse_altar_top': tex_altar_top(False),
        'eclipse_altar_top_active': tex_altar_top(True), 'eclipse_altar_gold': tex_altar_gold(),
    }.items():
        save(img, 'block/%s.png' % name)
    for name, img in {
        'eclipse_core': item_core(), 'eclipse_sigil': item_sigil(), 'umbral_shard': item_shard(),
        'warden_crown': item_crown(), 'eclipse_blade': item_blade(), 'umbral_scepter': item_scepter(),
    }.items():
        save(img, 'item/%s.png' % name)
    for i in range(4):
        save(particle_spark(i), 'particle/eclipse_spark_%d.png' % i)
        save(particle_wisp(i), 'particle/umbral_wisp_%d.png' % i)
    save(effect_bolt(), 'entity/umbral_bolt.png')
    save(effect_slash(), 'entity/eclipse_slash.png')
    save(sky_corona(), 'environment/eclipse_corona.png')
    save(armor_layer(), 'models/armor/warden_layer_1.png')
    save(new(64, 32), 'models/armor/warden_layer_2.png')
    icon().save(os.path.join(ASSETS, 'icon.png'))
    boss()


if __name__ == '__main__':
    main()
