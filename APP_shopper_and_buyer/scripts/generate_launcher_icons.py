"""
Generate Yobou Market launcher icons for Android.

Renders a "Y + shopping bag" mark using Pillow at all standard Android
densities. The mark matches the in-app brand (primary #0034b9, gold #fdc003,
white foreground) so the home-screen icon and the in-app icon feel like one
brand.

Outputs:
  android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png
  android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png
  android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png

For adaptive-icon devices (Android 8+, mipmap-anydpi-v26/), Android uses the
foreground+background drawables we already authored in XML. The PNGs are the
fallback for older devices, and on adaptive devices the foreground PNG is used
for the "splash" / install dialog preview.
"""
import os
from PIL import Image, ImageDraw

# Brand palette — matches tailwind.config.js
PRIMARY_BLUE_DARK = (0, 52, 185)        # #0034b9 — bottom of background gradient
PRIMARY_BLUE_LIGHT = (0, 71, 241)       # #0047f1 — top of background gradient
WHITE = (255, 255, 255)
GOLD = (253, 192, 3)                    # #fdc003

# Standard Android launcher icon densities
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
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def draw_background(size, rounded=False):
    """Render the brand background tile (gradient blue, optional rounded mask)."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Linear vertical gradient: light at top, dark at bottom
    top = hex_to_rgb('#0047f1')
    bot = hex_to_rgb('#0034b9')
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    if rounded:
        # Circular mask for round launcher icons
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out

    # Square tile with a subtle 18% corner radius so it reads "premium app"
    # rather than a hard square. Modern launcher masks apply their own rounding,
    # so this stays legible on devices that don't mask (Android < 7.1).
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
    Render the Y + shopping bag artwork on a transparent canvas.
    The artwork is sized to the 66dp safe zone of an adaptive icon (centered
    in a 108dp viewport with 21dp padding). For the legacy PNG, we render at
    the full icon size — Android will mask it correctly.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Coordinate space: 108 units wide, mapped to `size` pixels.
    # All art lives in the safe zone x:[18..90], y:[18..90].
    def s(v):
        """Map a 108-unit coord to pixels."""
        return int(v * size / 108)

    # ----- Soft white glow ring behind the mark -----
    glow_radius = s(30)
    cx, cy = s(54), s(54)
    for r in range(glow_radius, 0, -1):
        alpha = int(60 * (1 - r / glow_radius) ** 2)
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            fill=(255, 255, 255, alpha),
        )

    # ----- Bag body (white rounded rectangle) -----
    # Spans x:[34..74], y:[60..84]. Trapezoidal: narrower at bottom (perspective).
    bag_top_left  = (s(34), s(60))
    bag_top_right = (s(74), s(60))
    bag_bot_right = (s(71), s(84))
    bag_bot_left  = (s(37), s(84))
    draw.polygon(
        [bag_top_left, bag_top_right, bag_bot_right, bag_bot_left],
        fill=WHITE,
    )

    # ----- Bag handles (these form the upper arms of the "Y") -----
    # Left arc: bag-top-left (~44,60) up to apex (~54,46)
    # Right arc: bag-top-right (~64,60) up to apex (~54,46)
    # Render as a thick stroked "Y" shape:
    handle_stroke = max(int(size * 0.07), 4)
    # Apex point
    apex = (s(54), s(46))
    # Left handle base
    left_base = (s(46), s(60))
    # Right handle base
    right_base = (s(62), s(60))

    # Draw the outer + inner arcs of the handles as a thick white ring
    # We'll approximate by drawing two filled polygons: the outer hull of the Y
    # arms and the inner negative space.
    # Outer hull: (apex_top, apex_right, right_base_outer, right_base_top,
    #             left_base_top, left_base_outer, apex_left)
    half = handle_stroke // 2
    # Direction vectors from apex to each base (normalized)
    def norm(p1, p2):
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        L = (dx * dx + dy * dy) ** 0.5
        return (dx / L, dy / L), L

    # Left arm
    Ld, LL = norm(apex, left_base)
    Lperp = (-Ld[1], Ld[0])
    L_outer_top = (apex[0] + Lperp[0] * half, apex[1] + Lperp[1] * half)
    L_outer_bot = (left_base[0] + Lperp[0] * half, left_base[1] + Lperp[1] * half)
    L_inner_top = (apex[0] - Lperp[0] * half, apex[1] - Lperp[1] * half)
    L_inner_bot = (left_base[0] - Lperp[0] * half, left_base[1] - Lperp[1] * half)

    # Right arm
    Rd, RL = norm(apex, right_base)
    Rperp = (-Rd[1], Rd[0])
    R_outer_top = (apex[0] + Rperp[0] * half, apex[1] + Rperp[1] * half)
    R_outer_bot = (right_base[0] + Rperp[0] * half, right_base[1] + Rperp[1] * half)
    R_inner_top = (apex[0] - Rperp[0] * half, apex[1] - Rperp[1] * half)
    R_inner_bot = (right_base[0] - Rperp[0] * half, right_base[1] - Rperp[1] * half)

    # Left arm as quadrilateral
    draw.polygon([L_outer_top, L_outer_bot, L_inner_bot, L_inner_top], fill=WHITE)
    # Right arm as quadrilateral
    draw.polygon([R_outer_top, R_outer_bot, R_inner_bot, R_inner_top], fill=WHITE)

    # ----- Y stem: short vertical descender from the apex into the bag -----
    stem_w = handle_stroke
    stem_left = s(54) - stem_w // 2
    stem_right = s(54) + stem_w // 2
    draw.rectangle((stem_left, s(46), stem_right, s(70)), fill=WHITE)

    # ----- Gold accent: thin horizontal stripe across the bag's top edge -----
    gold_stripe_top = s(67)
    gold_stripe_bot = s(71)
    draw.rectangle(
        (s(36), gold_stripe_top, s(72), gold_stripe_bot),
        fill=GOLD,
    )

    # ----- Gold dot inside the bag — the "Yobou mark" inside the marketplace bag -----
    dot_r = max(int(size * 0.025), 2)
    draw.ellipse(
        (s(54) - dot_r, s(78) - dot_r, s(54) + dot_r, s(78) + dot_r),
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

        # Square launcher icon
        sq = composite_launcher(px, rounded=False)
        sq_path = os.path.join(out_dir, 'ic_launcher.png')
        sq.save(sq_path, 'PNG', optimize=True)
        written.append(sq_path)

        # Round launcher icon
        rd = composite_launcher(px, rounded=True)
        rd_path = os.path.join(out_dir, 'ic_launcher_round.png')
        rd.save(rd_path, 'PNG', optimize=True)
        written.append(rd_path)

        # Foreground only — used by adaptive-icon devices and as the icon
        # preview shown in the install dialog
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