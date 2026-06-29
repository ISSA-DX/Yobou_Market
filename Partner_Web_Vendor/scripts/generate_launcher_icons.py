"""
Generate Yobou Partner launcher icons for Android.

Concept: A briefcase silhouette (the "partner business" mark) in white with
the Y monogram cut out as negative space in the briefcase body, and a small
gold checkmark at the upper-right (signaling "approved partner / verified
vendor"). The briefcase silhouette is what makes "partner/vendor" legible at
48dp; the Y monogram stays for cross-app brand recognition; the gold check
replaces the commerce-price-tag of the customer icon with a trust/approval
signal that fits the partner relationship.

Why not just reuse the customer icon with a different background? Because
the two apps live side-by-side on the same phone. The briefcase silhouette
makes them visually distinguishable in the app drawer at a glance.

Brand palette (matches tailwind.config.js):
  primary-dark  #0034b9  (gradient bottom — same as in-app brand blue)
  primary-light #0047f1  (gradient top)
  white         #ffffff  (briefcase silhouette)
  gold          #fdc003  (check accent — same Tailwind secondary as customer)
  BAG_BLUE      #0047f1  (Y monogram "cutout" color, matches customer icon)

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
GOLD = (253, 192, 3)                    # #fdc003 — check accent
BAG_BLUE = (0, 71, 241)                 # #0047f1 — color used as Y "cutout" fill
                                        # so the Y reads as negative space inside
                                        # the white briefcase silhouette.

# Standard Android launcher icon densities (px per Android baseline)
DENSITIES = {
    'mdpi':    48,
    'hdpi':    72,
    'xhdpi':   96,
    'xxhdpi':  144,
    'xxxhdpi': 192,
}

# PROJECT_ROOT is the partner app folder (one level up from this script).
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res')


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# Briefcase + Y + check geometry (108-unit design viewport, identical to
# Android's adaptive-icon spec — the inner 66-unit safe zone is the canvas
# inside which the briefcase + Y must live so aggressive launcher masks
# don't clip them).
#
# The composition has three layers, drawn back-to-front:
#   1. Briefcase silhouette — a rounded-rectangle in white with a thin
#      handle arc above it. Reads as "briefcase / business partner" at
#      48dp; the rounded corners make it survive launcher masks.
#   2. Y monogram in BAG_BLUE — sits inside the briefcase as if "cut out",
#      the same blue as the icon background so it reads as negative space.
#   3. Gold checkmark — small, at the upper-right of the briefcase. Signals
#      "approved vendor / verified partner" — semantically distinct from
#      the customer icon's commerce-price-tag while reusing the same gold.
# ---------------------------------------------------------------------------

# Briefcase body — occupies most of the inner safe zone.
CASE_X0, CASE_Y0 = 22, 38               # top-left corner of case body
CASE_X1, CASE_Y1 = 86, 88               # bottom-right corner of case body
CASE_CORNER_R = 6                       # rounded corner radius (in viewport units)

# Briefcase handle — a thin arc above the case body. Same shape as the
# customer icon's bag handle for cross-app continuity.
HANDLE_Y0 = 22                          # top of the handle
HANDLE_Y1 = 40                          # where the handle meets the case top
HANDLE_X0, HANDLE_X1 = 42, 66           # horizontal span of the handle (narrower than bag)

# Horizontal divider — a thin strip across the briefcase body at 56% down
# to suggest the briefcase lid seam. Slightly darker than the case so it
# reads as a structural line, not a decoration.
SEAM_Y = 60                             # y-position of the seam
SEAM_THICK = 2                          # thickness of the seam

# Y monogram — drawn inside the briefcase body, ABOVE the seam so it sits
# in the "lid" portion. Same proportions as the customer icon's Y so the
# two apps feel like siblings.
Y_TOP_Y = 44                            # top edge of the Y arms
Y_ARM_OUTER_X_LEFT = 36                 # outer top-left corner of left arm
Y_ARM_OUTER_X_RIGHT = 72                # outer top-right corner of right arm
Y_ARM_THICK = 7                         # thickness of upper arms
Y_APEX_X = 54                           # horizontal center (apex junction)
Y_APEX_Y = 56                           # apex junction — just above the seam
Y_STEM_BOTTOM_Y = 60                    # stem ends at the seam so it reads as
                                        # capped by the briefcase divider

# Gold checkmark — two strokes forming a check, at upper-right.
CHECK_X0, CHECK_Y0 = 70, 22             # start of the short stroke (lower-left of check)
CHECK_X1, CHECK_Y1 = 76, 30             # corner of the check (bottom point)
CHECK_X2, CHECK_Y2 = 84, 18             # end of the long stroke (upper-right)
CHECK_THICK = 3                         # thickness of the check strokes


def case_polygon_vertices():
    """
    Return vertices for the briefcase silhouette (rounded rectangle).

    Same chamfered-corner approach as the customer icon's bag — drawn as
    a polygon, then smoothed with overlay circles at each vertex.
    """
    r = CASE_CORNER_R
    return [
        (CASE_X0 + r, CASE_Y0),
        (CASE_X1 - r, CASE_Y0),
        (CASE_X1, CASE_Y0 + r),
        (CASE_X1, CASE_Y1 - r),
        (CASE_X1 - r, CASE_Y1),
        (CASE_X0 + r, CASE_Y1),
        (CASE_X0, CASE_Y1 - r),
        (CASE_X0, CASE_Y0 + r),
    ]


def case_handle_vertices():
    """Return vertices for the briefcase handle (thin trapezoid above body)."""
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

    # Stem — a tapered rectangle from the apex junction down to the seam.
    stem_top_left = (Y_APEX_X - half_arm, Y_APEX_Y)
    stem_top_right = (Y_APEX_X + half_arm, Y_APEX_Y)
    stem_bot_left = (Y_APEX_X - half_arm - 1, Y_STEM_BOTTOM_Y)
    stem_bot_right = (Y_APEX_X + half_arm + 1, Y_STEM_BOTTOM_Y)
    stem = [stem_top_left, stem_top_right, stem_bot_right, stem_bot_left]

    return [left_arm, right_arm, stem]


def seam_rect():
    """Return (x0, y0, x1, y1) for the briefcase seam strip."""
    return (CASE_X0 + 2, SEAM_Y - SEAM_THICK // 2, CASE_X1 - 2, SEAM_Y + SEAM_THICK // 2)


def check_polygon_vertices():
    """
    Return two stroke polygons for the gold checkmark.

    Each stroke is a quadrilateral — start point, two endpoint corners,
    end point — thickened perpendicular to the stroke direction so the
    check reads cleanly at every density.
    """
    import math

    def stroke(p0, p1, t):
        x0, y0 = p0
        x1, y1 = p1
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1
        # Perpendicular unit vector.
        nx, ny = -dy / length, dx / length
        half = t / 2
        return [
            (x0 + nx * half, y0 + ny * half),
            (x1 + nx * half, y1 + ny * half),
            (x1 - nx * half, y1 - ny * half),
            (x0 - nx * half, y0 - ny * half),
        ]

    # Short stroke from the corner of the check up-right.
    s1 = stroke((CHECK_X0, CHECK_Y0), (CHECK_X1, CHECK_Y1), CHECK_THICK)
    # Long stroke from the corner of the check up-right to the tip.
    s2 = stroke((CHECK_X1, CHECK_Y1), (CHECK_X2, CHECK_Y2), CHECK_THICK)
    return [s1, s2]


# ---------------------------------------------------------------------------
# Drawing functions
# ---------------------------------------------------------------------------

def draw_background(size, rounded=False):
    """Render the brand background tile (vertical gradient blue).

    Same gradient as the customer icon so the two apps feel like siblings.
    """
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

    # Top-edge highlight — same wash as the customer icon.
    hl = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    for y in range(int(size * 0.30)):
        a = int(255 * (1 - y / (size * 0.30)) ** 2 * 0.10)
        hd.line([(0, y), (size, y)], fill=(255, 255, 255, a))
    img.alpha_composite(hl)

    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out

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
    Render the briefcase + Y cutout + seam + check on a transparent canvas.
    All geometry is in 108-unit viewport space, mapped to `size` pixels.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def s(v):
        """Map a 108-unit coord to pixels."""
        return int(v * size / 108)

    # Layer 1: briefcase handle (trapezoid) — drawn first so the case body
    # overlaps it cleanly along the case top edge.
    handle = [(s(x), s(y)) for x, y in case_handle_vertices()]
    draw.polygon(handle, fill=WHITE)

    # Layer 2: case body — rounded-rectangle silhouette.
    body = [(s(x), s(y)) for x, y in case_polygon_vertices()]
    draw.polygon(body, fill=WHITE)

    # Smooth the chamfered corners into proper rounded corners by overlaying
    # circles at each vertex.
    for vx, vy in body:
        r_px = s(CASE_CORNER_R)
        draw.ellipse(
            (s(vx) - r_px, s(vy) - r_px, s(vx) + r_px, s(vy) + r_px),
            fill=WHITE,
        )

    # Layer 3: seam strip — a thin horizontal line in BAG_BLUE across the
    # case at SEAM_Y. Reads as the briefcase's lid hinge. Drawn before the
    # Y monogram so the Y stem appears to terminate at the seam.
    sx0, sy0, sx1, sy1 = seam_rect()
    draw.rectangle((s(sx0), s(sy0), s(sx1), s(sy1)), fill=BAG_BLUE)

    # Layer 4: Y monogram in BAG_BLUE — drawn on top of the white case so
    # it reads as negative space.
    for poly in y_polygon_vertices():
        draw.polygon([(s(x), s(y)) for x, y in poly], fill=BAG_BLUE)

    # Layer 5: gold checkmark — drawn last so it sits on top of everything
    # else. Two strokes forming a check at upper-right.
    for stroke in check_polygon_vertices():
        draw.polygon([(s(x), s(y)) for x, y in stroke], fill=GOLD)

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