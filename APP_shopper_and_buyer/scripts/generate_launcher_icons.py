"""
Generate Yobou Market launcher icons for Android.

Concept: A rounded-rectangle shopping bag silhouette (the "bag footprint")
in white with a Y monogram cut out as negative space in the bag's center,
and a small gold price-tag dot at the upper-right of the bag. The bag
silhouette is what makes "market" legible at 48dp; the Y monogram stays
for brand recognition; the gold tag replaces the decorative dot with a
commerce-meaningful shape.

Brand palette (matches tailwind.config.js):
  primary-dark  #0034b9  (gradient bottom — same as in-app brand blue)
  primary-light #0047f1  (gradient top)
  white         #ffffff  (bag silhouette)
  gold          #fdc003  (price-tag accent — same as Tailwind secondary)

Outputs (15 PNGs at 5 densities):
  android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png
  android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png
  android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png

For adaptive-icon devices (Android 8+, mipmap-anydpi-v26/), Android uses the
foreground+background drawables authored as XML vectors. The PNGs are the
fallback for older devices and are also used as the icon preview shown in
the install dialog.

Run: python scripts/generate_launcher_icons.py
"""
import os
from PIL import Image, ImageDraw

# Brand palette — matches tailwind.config.js
PRIMARY_BLUE_DARK = (0, 52, 185)        # #0034b9 — bottom of background gradient
PRIMARY_BLUE_LIGHT = (0, 71, 241)       # #0047f1 — top of background gradient
WHITE = (255, 255, 255)
GOLD = (253, 192, 3)                    # #fdc003
BAG_BLUE = (0, 71, 241)                 # #0047f1 — color used as Y "cutout" fill
                                         # so the Y reads as negative space inside
                                         # the white bag silhouette.

# Standard Android launcher icon densities (px per Android baseline)
DENSITIES = {
    'mdpi':    48,
    'hdpi':    72,
    'xhdpi':   96,
    'xxhdpi':  144,
    'xxxhdpi': 192,
}

# PROJECT_ROOT is the shopper app folder (one level up from this script).
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res')


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# Bag + Y geometry (108-unit design viewport, identical to Android's
# adaptive-icon spec — the inner 66-unit safe zone is the canvas inside
# which the bag + Y must live so aggressive launcher masks don't clip them).
#
# The composition has three layers, drawn back-to-front:
#   1. Bag silhouette — a rounded-rectangle in white with a thin handle arc
#      above the bag body. The bag is wider than tall so it reads as a
#      shopping tote at small sizes.
#   2. Y monogram in BAG_BLUE — sits inside the bag as if "cut out", the
#      same blue as the icon background so it reads as negative space.
#   3. Gold price tag — small pentagon-with-hole at the upper-right of the
#      bag. Replaces the old decorative dot with a shape that signals
#      "commerce" (a price tag).
# ---------------------------------------------------------------------------

# Bag body — occupies most of the inner safe zone.
BAG_X0, BAG_Y0 = 22, 36                # top-left corner of bag body
BAG_X1, BAG_Y1 = 86, 90                # bottom-right corner of bag body
BAG_CORNER_R = 8                       # rounded corner radius (in viewport units)

# Bag handle — a thin arc above the bag. Two endpoints + thickness.
HANDLE_Y0 = 22                         # top of the handle
HANDLE_Y1 = 40                         # where the handle meets the bag top
HANDLE_X0, HANDLE_X1 = 40, 68          # horizontal span of the handle

# Y monogram — drawn inside the bag. Smaller than the standalone-Y icon
# because it has to fit inside the bag silhouette and leave breathing room
# on all sides.
Y_TOP_Y = 50                           # top edge of the Y arms
Y_ARM_OUTER_X_LEFT = 36                # outer top-left corner of left arm
Y_ARM_OUTER_X_RIGHT = 72               # outer top-right corner of right arm
Y_ARM_THICK = 8                        # thickness of upper arms
Y_APEX_X = 54                          # horizontal center (apex junction)
Y_APEX_Y = 64                          # apex junction
Y_STEM_BOTTOM_Y = 80                   # where the stem meets the bag floor
                                       # (we don't draw a flared base — the
                                       # bag's bottom edge is the floor)

# Gold price tag — a small rounded rectangle with a triangular tip pointing
# down-right, plus a tiny circle for the "string hole". Sits at upper-right.
TAG_CX, TAG_CY = 80, 32                # center of the tag's body
TAG_W, TAG_H = 11, 8                   # body size
TAG_TIP_DX, TAG_TIP_DY = 4, 4          # tip offset
TAG_HOLE_R = 1.2                       # string-hole radius


def bag_polygon_vertices():
    """
    Return vertices for the bag silhouette (rounded rectangle).

    The bag is drawn as a filled rounded rectangle; for sharp-edge pixels
    on small icons we approximate it as a polygon with chamfered corners
    so the silhouette survives the icon-mask roundings on older devices.
    """
    r = BAG_CORNER_R
    # 8-vertex chamfered rectangle (clockwise from top-left corner).
    return [
        (BAG_X0 + r, BAG_Y0),
        (BAG_X1 - r, BAG_Y0),
        (BAG_X1, BAG_Y0 + r),
        (BAG_X1, BAG_Y1 - r),
        (BAG_X1 - r, BAG_Y1),
        (BAG_X0 + r, BAG_Y1),
        (BAG_X0, BAG_Y1 - r),
        (BAG_X0, BAG_Y0 + r),
    ]


def bag_handle_vertices():
    """
    Return vertices for the bag handle — a thin arc above the bag.

    Approximated as a thin trapezoid (top narrower than bottom) so it
    renders crisply at every density. The trapezoid's top edge runs from
    (HANDLE_X0 + 2, HANDLE_Y0) to (HANDLE_X1 - 2, HANDLE_Y0); the bottom
    edge sits flush with the bag top (HANDLE_Y1).
    """
    return [
        (HANDLE_X0 + 4, HANDLE_Y0),
        (HANDLE_X1 - 4, HANDLE_Y0),
        (HANDLE_X1, HANDLE_Y1),
        (HANDLE_X0, HANDLE_Y1),
    ]


def y_polygon_vertices():
    """Return the Y monogram vertices (drawn in BAG_BLUE as a cutout)."""
    half_arm = Y_ARM_THICK / 2
    arm_inner_offset = 2

    # Left arm — parallelogram from upper-left to the apex junction.
    left_arm = [
        (Y_ARM_OUTER_X_LEFT, Y_TOP_Y),
        (Y_ARM_OUTER_X_LEFT + Y_ARM_THICK, Y_TOP_Y),
        (Y_APEX_X + arm_inner_offset, Y_APEX_Y),
        (Y_APEX_X - half_arm - 1, Y_APEX_Y - 1),
    ]

    # Right arm — mirror of left.
    right_arm = [
        (Y_ARM_OUTER_X_RIGHT, Y_TOP_Y),
        (Y_ARM_OUTER_X_RIGHT - Y_ARM_THICK, Y_TOP_Y),
        (Y_APEX_X + half_arm + 1, Y_APEX_Y - 1),
        (Y_APEX_X - arm_inner_offset, Y_APEX_Y),
    ]

    # Stem — a tapered rectangle from the apex junction down to the bag floor.
    stem_top_left = (Y_APEX_X - half_arm, Y_APEX_Y)
    stem_top_right = (Y_APEX_X + half_arm, Y_APEX_Y)
    stem_bot_left = (Y_APEX_X - half_arm - 1, Y_STEM_BOTTOM_Y)
    stem_bot_right = (Y_APEX_X + half_arm + 1, Y_STEM_BOTTOM_Y)
    stem = [stem_top_left, stem_top_right, stem_bot_right, stem_bot_left]

    return [left_arm, right_arm, stem]


def price_tag_vertices():
    """
    Return (body_polygon, hole_circle) for the gold price tag.

    The body is a rounded rectangle with a triangular tip extending
    down-and-right, suggesting a real price tag. The hole is a small
    circle punched out via a second draw pass (we draw the tag body, then
    draw a transparent circle on top).
    """
    x0 = TAG_CX - TAG_W / 2
    y0 = TAG_CY - TAG_H / 2
    x1 = TAG_CX + TAG_W / 2
    y1 = TAG_CY + TAG_H / 2
    body = [
        (x0, y0),
        (x1, y0),
        (x1 + TAG_TIP_DX, TAG_CY),
        (x1, y1),
        (x0, y1),
    ]
    return body, (TAG_CX - TAG_W / 4, TAG_CY, TAG_HOLE_R)


# ---------------------------------------------------------------------------
# Drawing functions
# ---------------------------------------------------------------------------

def draw_background(size, rounded=False):
    """Render the brand background tile (vertical gradient blue)."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    top = hex_to_rgb('#0047f1')
    bot = hex_to_rgb('#0034b9')
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Top-edge highlight — thin white wash that fades to transparent over
    # the first 30% of the tile. Adds a "lit glass" feel at full size and
    # vanishes cleanly at 48dp.
    hl = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    for y in range(int(size * 0.30)):
        a = int(255 * (1 - y / (size * 0.30)) ** 2 * 0.10)
        hd.line([(0, y), (size, y)], fill=(255, 255, 255, a))
    img.alpha_composite(hl)

    if rounded:
        # Circular mask for round launcher icons (legacy devices).
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out

    # Square tile with a subtle 18% corner radius. Modern launcher masks
    # apply their own rounding; this keeps it legible on devices that
    # don't mask (Android < 7.1).
    radius = int(size * 0.18)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=radius, fill=255
    )
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def draw_foreground(size):
    """
    Render the bag + Y cutout + price tag on a transparent canvas.
    All geometry is in 108-unit viewport space, mapped to `size` pixels.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def s(v):
        """Map a 108-unit coord to pixels."""
        return int(v * size / 108)

    # Layer 1: bag handle (trapezoid) — drawn first so the bag body
    # overlaps it cleanly along the bag's top edge.
    handle = [(s(x), s(y)) for x, y in bag_handle_vertices()]
    draw.polygon(handle, fill=WHITE)

    # Layer 2: bag body — rounded-rectangle silhouette.
    body = [(s(x), s(y)) for x, y in bag_polygon_vertices()]
    draw.polygon(body, fill=WHITE)

    # Smooth the chamfered corners into proper rounded corners by overlaying
    # circles at each vertex. PIL's draw.polygon is sharp-corner only.
    for vx, vy in body:
        r_px = s(BAG_CORNER_R)
        draw.ellipse(
            (s(vx) - r_px, s(vy) - r_px, s(vx) + r_px, s(vy) + r_px),
            fill=WHITE,
        )

    # Layer 3: Y monogram in BAG_BLUE — drawn on top of the white bag so
    # it reads as negative space.
    for poly in y_polygon_vertices():
        draw.polygon([(s(x), s(y)) for x, y in poly], fill=BAG_BLUE)

    # Layer 4: gold price tag.
    tag_body, (hx, hy, hr) = price_tag_vertices()
    draw.polygon([(s(x), s(y)) for x, y in tag_body], fill=GOLD)
    # String-hole — punch a transparent circle so the tag reads as a tag.
    hole_r_px = max(1, s(hr))
    draw.ellipse(
        (s(hx) - hole_r_px, s(hy) - hole_r_px, s(hx) + hole_r_px, s(hy) + hole_r_px),
        fill=(0, 0, 0, 0),
    )

    return img


def composite_launcher(size, rounded=False):
    """Render a full launcher icon (background + foreground)."""
    bg = draw_background(size, rounded=rounded)
    fg = draw_foreground(size)
    bg.alpha_composite(fg)
    return bg


def write_icons():
    """Write the launcher icons and foreground PNGs at all standard densities."""
    written = []
    for density, px in DENSITIES.items():
        out_dir = os.path.join(RES_DIR, f'mipmap-{density}')
        os.makedirs(out_dir, exist_ok=True)

        # Square launcher icon.
        sq = composite_launcher(px, rounded=False)
        sq_path = os.path.join(out_dir, 'ic_launcher.png')
        sq.save(sq_path, 'PNG', optimize=True)
        written.append(sq_path)

        # Round launcher icon (legacy devices).
        rd = composite_launcher(px, rounded=True)
        rd_path = os.path.join(out_dir, 'ic_launcher_round.png')
        rd.save(rd_path, 'PNG', optimize=True)
        written.append(rd_path)

        # Foreground only — used by adaptive-icon devices and as the icon
        # preview shown in the install dialog.
        fg = draw_foreground(px)
        fg_path = os.path.join(out_dir, 'ic_launcher_foreground.png')
        fg.save(fg_path, 'PNG', optimize=True)
        written.append(fg_path)

    return written


if __name__ == '__main__':
    paths = write_icons()
    print(f'Wrote {len(paths)} icon files:')
    for p in paths:
        size = os.path.getsize(p)
        print(f'  {p}  ({size} bytes)')