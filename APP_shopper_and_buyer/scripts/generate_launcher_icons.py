"""
Generate Yobou Market launcher icons for Android.

Concept: Bold Y monogram with a flared bag-footprint base and one gold
accent dot. Designed to read clearly at 48dp (home-screen size) where
only a single dominant shape survives — every previous detail in earlier
iterations collapsed at small sizes. The Y is one solid polygon, the
gold dot is one circle, the gradient is a single vertical wash.

Brand palette (matches tailwind.config.js):
  primary-dark  #0034b9  (gradient bottom — same as in-app brand blue)
  primary-light #0047f1  (gradient top)
  white         #ffffff  (Y fill)
  gold          #fdc003  (single dot accent — same as Tailwind secondary)

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
# Y monogram geometry (108-unit design viewport, identical to Android's
# adaptive-icon spec — the inner 66-unit safe zone is the canvas inside
# which the Y must live so aggressive launcher masks don't clip it).
#
# The Y is a single 12-vertex polygon. Three bands of form:
#   1. Two upper arms (mirror-symmetric) meeting at the apex junction.
#   2. A short stem dropping from the apex junction.
#   3. A flared base (wider than the stem) that implies a shopping-bag
#      opening without drawing one — a silhouette cue, not an illustration.
# ---------------------------------------------------------------------------

# All coordinates are in the 108-unit viewport. Strokes are ~11 units
# thick (10% of the viewport), which is the smallest width that survives
# at 48dp (mdpi) without aliasing into mush.
ARM_THICK = 11          # thickness of the upper Y arms
STEM_TOP_WIDTH = 14     # stem thickness where it meets the arms
BASE_FLARE = 22         # wider than stem_top_width — the "bag opening" cue
APEX_X = 54             # horizontal center

# Upper arms: each arm is a parallelogram from the apex junction up-and-out.
# Left arm spans from the apex (54, 38) up-left to (22, 14). Right arm is
# mirror-symmetric. The arms are drawn as filled polygons (outer edge then
# inner edge back) for an even-weight stroke.
ARM_TOP_Y = 14          # top edge of the arms
ARM_OUTER_X_LEFT = 18   # outer top-left corner
ARM_OUTER_X_RIGHT = 90  # outer top-right corner

# Apex junction (where the arms meet and the stem begins).
APEX_Y = 38

# Stem (vertical descender from apex into the bag-footprint base).
STEM_BOTTOM_Y = 70
BASE_TOP_Y = 70         # where the flare begins
BASE_BOTTOM_Y = 90      # where the flare ends (sits within safe zone)


def y_polygon_vertices():
    """Return the 12 vertices of the Y monogram in 108-unit viewport coords."""
    half_arm = ARM_THICK / 2
    half_stem_top = STEM_TOP_WIDTH / 2
    half_base = BASE_FLARE / 2

    # Left arm as a quadrilateral. Outer edge runs from the apex down-and-left
    # to the outer top-left of the arm; inner edge runs back to the inner
    # top-right of the arm (just right of the apex).
    #   outer-top  = (ARM_OUTER_X_LEFT, ARM_TOP_Y)
    #   outer-bot  = (APEX_X - half_arm*sqrt(2), APEX_Y)  — perpendicular offset
    # but a simpler approximation: each arm is a rectangle tilted 45°, drawn
    # as the convex hull of 4 corners.
    # Top-left arm corners (clockwise from upper-left):
    tl_outer = (ARM_OUTER_X_LEFT, ARM_TOP_Y)
    tl_inner = (ARM_OUTER_X_LEFT + ARM_THICK, ARM_TOP_Y)
    # Approximate the bottom of the arm as two points straddling the apex,
    # each offset perpendicular to the arm's diagonal by half_arm on each side.
    # For a 45° arm: perp offset = (half_arm*sin45, -half_arm*cos45) —
    # but we keep it simple and use horizontal offsets.
    tl_bot_outer = (APEX_X - half_arm - 2, APEX_Y - 1)
    tl_bot_inner = (APEX_X + 2, APEX_Y - 1)
    left_arm = [tl_outer, tl_bot_outer, tl_bot_inner, tl_inner]

    # Right arm — mirror of left.
    tr_outer = (ARM_OUTER_X_RIGHT, ARM_TOP_Y)
    tr_inner = (ARM_OUTER_X_RIGHT - ARM_THICK, ARM_TOP_Y)
    tr_bot_outer = (APEX_X + half_arm + 2, APEX_Y - 1)
    tr_bot_inner = (APEX_X - 2, APEX_Y - 1)
    right_arm = [tr_outer, tr_bot_inner, tr_bot_outer, tr_inner]

    # Stem + base as one continuous shape (so the flare reads as part of the
    # Y, not a separate bag glued underneath).
    stem_left_top = (APEX_X - half_stem_top, APEX_Y)
    stem_right_top = (APEX_X + half_stem_top, APEX_Y)
    base_left_top = (APEX_X - half_base, BASE_TOP_Y)
    base_right_top = (APEX_X + half_base, BASE_TOP_Y)
    base_left_bot = (APEX_X - half_base, BASE_BOTTOM_Y)
    base_right_bot = (APEX_X + half_base, BASE_BOTTOM_Y)
    stem_and_base = [stem_left_top, stem_right_top, base_right_top,
                     base_right_bot, base_left_bot, base_left_top]

    # Combine: draw left arm, right arm, then stem-and-base on top.
    # We return them as a list of polygons; composite in draw order.
    return [left_arm, right_arm, stem_and_base]


def gold_dot_vertices():
    """Single gold accent dot — sits in the upper-right negative space."""
    # 4-unit radius dot tucked into the gap between the right arm and the
    # canvas edge. Positioned at (84, 30) — well inside the safe zone.
    cx, cy, r = 84, 30, 4
    return [(cx - r, cy - r), (cx + r, cy - r), (cx + r, cy + r), (cx - r, cy + r)]


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
    Render the Y monogram + gold accent dot on a transparent canvas.
    All geometry is in 108-unit viewport space, mapped to `size` pixels.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def s(v):
        """Map a 108-unit coord to pixels."""
        return int(v * size / 108)

    # Subtle white glow ring behind the Y — gives the icon a "lifted"
    # feel on the gradient background. Soft enough to vanish at 48dp
    # without becoming a halo.
    glow_radius = s(38)
    cx, cy = s(APEX_X), s((ARM_TOP_Y + BASE_BOTTOM_Y) / 2)
    for r in range(glow_radius, 0, -1):
        alpha = int(40 * (1 - r / glow_radius) ** 2)
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            fill=(255, 255, 255, alpha),
        )

    # Draw the Y polygons in white.
    for poly in y_polygon_vertices():
        draw.polygon([(s(x), s(y)) for x, y in poly], fill=WHITE)

    # Draw the gold dot — single circle, the only warm accent on the icon.
    dot_verts = gold_dot_vertices()
    xs = [v[0] for v in dot_verts]
    ys = [v[1] for v in dot_verts]
    draw.ellipse(
        (s(min(xs)), s(min(ys)), s(max(xs)), s(max(ys))),
        fill=GOLD,
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
