"""Builds the hand-made highlands island (public/models/HighlandsIsland.glb) in Blender from the exported layout.

  npm run island:export -- highlands
  python scripts/blender/highlands_island.py assets-raw/highlands-layout.json assets-raw/HighlandsIsland.raw.glb   (bpy)
  npm run island:pack -- highlands

Green terraces over a loch: grey lichened crags, heather and bracken, Scots pines, a burn running from the loch to the
sea under a stone bridge, drystone walls and sheep, a stone bothy at the camp and a ruined castle on the crag. The
shared pipeline lives in island_core.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import island_core  # noqa: E402

island_core.init('highlands')
from island_core import *  # noqa: E402,F401,F403

HL = {
    'grass': '#86B36A', 'grassLight': '#9CC47A', 'grassDark': '#6E9A58', 'heather': '#9C6FA6', 'heatherLight': '#B98BC0',
    'bracken': '#B8864F', 'moss': '#7FA35E',
    'stone': '#9C9D96', 'stoneLit': '#B2B2AA', 'stoneShade': '#84867F', 'stoneDark': '#686B66', 'lichen': '#B7B77A',
    'castle': '#A9A69C', 'castleLit': '#BDBAB0', 'castleShade': '#8E8B82', 'slate': '#5E6770',
    'pineBark': '#A0603E', 'pine': '#3F6B4E', 'pineDark': '#2F5540', 'pineLight': '#55835E',
    'loch': '#3F7F95', 'lochMid': '#5E9FB0', 'lochEdge': '#A9D2D6', 'mist': '#E4F1F2',
}
PAL.update({'sand': '#E3D3AE', 'sandWall': '#CDBB94', 'path': '#D8CCB2', 'pathEdge': '#C2B599', 'tread': '#8E8F88',
            'fall': '#B9E2E6', 'fallStreak': '#FFFFFF'})
FOL.update({'campfireStone': '#A9AAA3', 'log': '#8A6446', 'stumpInner': '#C9A57C', 'ember': '#F2A25C'})


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------------------------------- terrain

def crag_offset(level, seed):
    """Rounded, glaciated crags: broad bulges, a couple of soft ledges, scree at the foot, a grassy lip on top."""
    lo = LEVEL_Y[level - 1]
    hi = LEVEL_Y[level]

    def off(i, f, y):
        if y >= hi - 1e-6:
            return 0.0
        a = 2 * math.pi * i / 128
        h = (y - lo) / (hi - lo)
        bulge = noise.noise(Vector((math.cos(a) * 3 + seed, math.sin(a) * 3, h * 1.1)))
        d = 0.045 * bulge + 0.008 * noise.noise(Vector((math.cos(a) * 9, math.sin(a) * 9, h * 2 + seed)))
        d += 0.015 * math.sin(h * math.pi * 3 + seed) ** 2
        d += 0.07 * max(0.0, 1 - h * 3)  # scree; linear, so the foot meets the ground at an angle
        if h > 0.93:
            d = 0.014  # turf lip
        return d

    return off


def stone(x, y, z):
    n = noise.noise(Vector((x * 1.8, y * 1.3, z * 1.8)))
    k = mix(col(HL['stoneShade']), col(HL['stoneLit']), smooth(0.5 + 0.8 * n))
    lichen = noise.noise(Vector((x * 4, y * 3, z * 4 + 7)))
    return mix(k, col(HL['lichen']), smooth((lichen - 0.25) / 0.2) * 0.45)


def loch_radius(a):
    """Shoreline radius of the loch in direction a (layout xz), interpolated between its samples."""
    cx, cz, radii = LOCH
    n = len(radii)
    f = (a % (2 * math.pi)) / (2 * math.pi) * n
    i = int(f) % n
    t = f - int(f)
    return radii[i] * (1 - t) + radii[(i + 1) % n] * t


def loch_dist(x, z):
    if not LOCH:
        return 9.0
    return math.hypot(x - LOCH[0], z - LOCH[1]) - loch_radius(math.atan2(z - LOCH[1], x - LOCH[0]))


def moor(x, z, top=False):
    """Grass with drifts of heather and bracken; the lawn stays greener near the loch."""
    n = noise.noise(Vector((x * 1.2, z * 1.2, 4.4))) * 0.7 + noise.noise(Vector((x * 3.6, z * 3.6, 8.2))) * 0.3
    k = mix(col(HL['grass']), col(HL['grassLight']) if n > 0 else col(HL['grassDark']), min(1.0, abs(n) * 1.5))
    heather = noise.noise(Vector((x * 1.7, z * 1.7, 12.3)))
    bracken = noise.noise(Vector((x * 2.1, z * 2.1, 21.7)))
    wet = smooth((0.5 - loch_dist(x, z)) / 0.3)
    k = mix(k, mix(col(HL['heather']), col(HL['heatherLight']), smooth(0.5 + n)), smooth((heather - (0.05 if top else 0.25)) / 0.15) * (1 - wet) * 0.85)
    k = mix(k, col(HL['bracken']), smooth((bracken - 0.35) / 0.12) * (1 - wet) * 0.7)
    return k


def hl_cap(co):
    x, y, z = co.x, co.z, -co.y
    return moor(x, z, top=y > LEVEL_Y[LAWN] + 0.05)


def hl_lip(x, y, z, n1, n2):
    return mix(stone(x, y, z), col(HL['moss']), 0.4)


def hl_cliff(level, h, n1, n2, x, y, z):
    k = stone(x, y, z)
    k = mix(k, col(HL['stoneDark']), smooth((0.14 - h) / 0.1) * 0.6)
    k = mix(k, col(HL['moss']), smooth((h - 0.82) / 0.08))  # turf creeping over the rim
    return k




# ---------------------------------------------------------------------------------------------------------- plants and animals

def scots_pine(sink, M, h, r):
    """A tall orange-barked trunk with a few flat, clumpy crowns high up."""
    lean = Vector((r.uniform(-0.04, 0.04), r.uniform(-0.04, 0.04), 0))
    pts = [tuple(lean * t * t + Vector((0, 0, h * 0.78 * t))) for t in (0, 0.33, 0.66, 1.0)]
    sink.cyl(M, pts, [0.024, 0.02, 0.016, 0.012], 6, [col(HL['pineBark'])] * 2 + [col('#B97A52')])
    top = Vector(pts[-1])
    for k in range(r.randint(3, 4)):
        a = r.uniform(0, 2 * math.pi)
        z = h * r.uniform(-0.2, 0.02)
        off = Vector((math.cos(a) * h * 0.13, math.sin(a) * h * 0.13, z))
        if k:  # a branch out to each side clump
            sink.cyl(M, [tuple(top + Vector((0, 0, z - 0.02))), tuple(top + off)], [0.007, 0.005], 4, [col(HL['pineBark'])])
        rr = h * r.uniform(0.14, 0.19)
        sink.blob(M, top + off + Vector((0, 0, rr * 0.2)), rr, col(HL['pineLight']), col(HL['pine']), col(HL['pineDark']), subdiv=2, squash=0.5, jitter=0.1, seed=r.uniform(0, 50), smooth=True)


def heather(sink, M, h, r):
    for k in range(r.randint(2, 4)):
        o = Vector((r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 0))
        c = col(r.choice((HL['heather'], HL['heatherLight'], '#8A5E96')))
        sink.blob(M, o + Vector((0, 0, h * 0.4)), h * r.uniform(0.5, 0.7), c, mix(c, col('#6E8A5A'), 0.3), col('#5E6E4E'), subdiv=1, squash=0.6, jitter=0.2, seed=r.uniform(0, 50))


def gorse(sink, M, h, r):
    rr = h * r.uniform(0.6, 0.75)
    sink.blob(M, (0, 0, rr * 0.65), rr, col('#7FA35E'), col('#5E8446'), col('#44683A'), subdiv=2, squash=0.8, jitter=0.12, seed=r.uniform(0, 50), smooth=True)
    for k in range(6):  # yellow flowers
        a = r.uniform(0, 2 * math.pi)
        e = r.uniform(0.3, 1.1)
        p = Vector((math.cos(a) * rr * 0.85 * math.cos(e * 0.6), math.sin(a) * rr * 0.85 * math.cos(e * 0.6), rr * 0.65 + rr * 0.6 * math.sin(e)))
        sink.blob(M, p, 0.009, col('#F4C542'), col('#F4C542'), col('#D9A62E'), subdiv=0, jitter=0)


def bracken(sink, M, h, r):
    n = r.randint(5, 7)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.25, 0.25)
        frond(sink, M, (0, 0, 0.005), yaw, h * r.uniform(1.2, 1.6), h * 0.3, r.uniform(0.9, 1.3), r.uniform(1.0, 1.3), col('#9A6A3A'), col(HL['bracken']), segs=4)


def boulder(sink, M, h, r):
    x, y = M.translation.x, M.translation.y
    sink.blob(M, (0, 0, h * 0.3), h * 0.7, mix(col(HL['stoneLit']), col(HL['lichen']), 0.3), col(HL['stone']), col(HL['stoneShade']), subdiv=1, squash=0.6, jitter=0.2, seed=r.uniform(0, 50))


def grass_tuft(sink, M, h, r):
    for i in range(5):
        a = 2 * math.pi * i / 5 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.011
        tip = d * h * 0.45 + Vector((0, 0, h * r.uniform(0.8, 1.1)))
        sink.face(M, [-s2, s2, tip], col(HL['grassLight']) if i % 2 else col('#C2B070'), double=True)


def sheep(sink, M, h, r):
    """A fluffy white sheep with a black face and legs."""
    wool, face = col('#F2EFE6'), col('#2E2A28')
    for x in (-0.018, 0.018):
        for y in (-0.01, 0.01):
            sink.cyl(M, [(x, y, 0), (x, y, 0.022)], [0.004, 0.004], 3, [face])
    sink.blob(M, (0, 0, 0.036), 0.03, wool, wool, col('#D8D2C4'), subdiv=1, squash=0.75, jitter=0.18, seed=r.uniform(0, 50))
    sink.blob(M @ Matrix.Diagonal((1.4, 1.0, 1.0, 1.0)), (0.025, 0, 0.042), 0.012, face, face, face, subdiv=1, jitter=0)
    sink.blob(M, (0.028, 0, 0.052), 0.012, wool, wool, wool, subdiv=0, jitter=0)


# ---------------------------------------------------------------------------------------------------------- structures

def crenellated_wall(sink, M, x0, x1, t, h, broken, r):
    """A wall along local x from x0 to x1, thickness t, height h, with merlons; broken walls lose a jagged gap."""
    lit, side, dark = col(HL['castleLit']), col(HL['castle']), col(HL['castleShade'])
    seg = 0.03
    n = max(1, int((x1 - x0) / seg))
    for k in range(n):
        a, b = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
        u = (k + 0.5) / n
        hh = h
        if broken:
            hh = h * max(0.25, 1 - 0.9 * math.exp(-((u - 0.55) / 0.18) ** 2)) * r.uniform(0.9, 1.0)
        box(sink, M, (a, -t / 2, -0.02), (b + 0.0005, t / 2, hh), lit, side if k % 2 else mix(side, dark, 0.3), dark)
        if hh >= h * 0.95 and k % 2 == 0:
            box(sink, M, (a, -t / 2, hh), (b, t / 2, hh + 0.022), lit, side, dark)


def tower(sink, M, x, y, rad, h, r):
    sides = 10
    rings = 4
    for k in range(rings):
        z0, z1 = h * k / rings, h * (k + 1) / rings
        sink.cyl(M, [(x, y, z0 - (0.02 if k == 0 else 0)), (x, y, z1)], [rad * 1.04, rad], sides, [col(HL['castle']) if k % 2 else col(HL['castleLit'])])
    sink.face(M, [(x + math.cos(2 * math.pi * i / sides) * rad, y + math.sin(2 * math.pi * i / sides) * rad, h) for i in range(sides)], col(HL['castleShade']))
    for i in range(0, sides, 2):  # merlons
        a0, a1 = 2 * math.pi * i / sides, 2 * math.pi * (i + 1) / sides
        c0, c1 = Vector((x + math.cos(a0) * rad, y + math.sin(a0) * rad, h)), Vector((x + math.cos(a1) * rad, y + math.sin(a1) * rad, h))
        mid = (c0 + c1) / 2
        box(sink, M @ Matrix.Translation(mid) @ Matrix.Rotation((a0 + a1) / 2 + math.pi / 2, 4, 'Z'), (-rad * 0.3, -0.012, 0), (rad * 0.3, 0.012, 0.024), col(HL['castleLit']), col(HL['castle']))
    for k in range(2):  # arrow slits
        a = -math.pi / 2 + 0.4 * (k - 0.5)
        z = h * (0.4 + 0.3 * k)
        p = Vector((x + math.cos(a) * (rad + 0.001), y + math.sin(a) * (rad + 0.001), z))
        sink.face(M, [tuple(p + Vector((-0.004, 0, 0))), tuple(p + Vector((0.004, 0, 0))), tuple(p + Vector((0.004, 0, 0.03))), tuple(p + Vector((-0.004, 0, 0.03)))], col('#2E3236'))


def castle(sink, M, size, r):
    """A small ruined castle: a square keep, a round corner tower and curtain walls, one of them breached."""
    s = size
    k0 = s * 0.42  # keep half-width
    kh = s * 1.15
    # keep
    for c in range(3):
        z0, z1 = kh * c / 3, kh * (c + 1) / 3
        box(sink, M, (-k0 - s * 0.35, -k0 + s * 0.2, z0 - (0.02 if c == 0 else 0)), (k0 - s * 0.35, k0 + s * 0.2, z1), col(HL['castleShade']), col(HL['castle']) if c % 2 else col(HL['castleLit']))
    for i in range(4):  # keep merlons along the front and sides
        x = -k0 - s * 0.35 + (2 * k0) * (i + 0.5) / 4
        box(sink, M, (x - k0 / 8, -k0 + s * 0.2, kh), (x + k0 / 8, -k0 + s * 0.2 + 0.03, kh + 0.028), col(HL['castleLit']), col(HL['castle']))
    for i, z in enumerate((kh * 0.35, kh * 0.7)):  # windows on the camera-facing wall
        x = -s * 0.35 + (i - 0.5) * k0 * 0.8
        sink.face(M, [(x - 0.009, -k0 + s * 0.2 - 0.001, z), (x + 0.009, -k0 + s * 0.2 - 0.001, z), (x + 0.009, -k0 + s * 0.2 - 0.001, z + 0.04), (x - 0.009, -k0 + s * 0.2 - 0.001, z + 0.04)][::-1], col('#2E3236'))
    # curtain walls around a small bailey in front and to the right of the keep
    wt, wh = 0.03, s * 0.55
    crenellated_wall(sink, M, -s * 0.35 + k0, s * 0.62, wt, wh, False, r)  # back wall (from keep)
    crenellated_wall(sink, M @ Matrix.Translation((0, -s * 0.75, 0)), -s * 0.5, s * 0.62, wt, wh, True, r)  # breached front wall
    crenellated_wall(sink, M @ Matrix.Translation((s * 0.62, 0, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z'), -0.0, s * 0.75, wt, wh * 0.9, False, r)  # right wall
    tower(sink, M, s * 0.62, -s * 0.75, s * 0.16, s * 0.95, r)  # round corner tower
    for k in range(4):  # fallen stones in the breach
        sink.blob(M, (r.uniform(-0.05, 0.2) * s * 2, -s * 0.75 - r.uniform(0.02, 0.08), 0.01), r.uniform(0.012, 0.022), col(HL['castleLit']), col(HL['castle']), col(HL['castleShade']), subdiv=0, squash=0.7, jitter=0.1, seed=k)


def bothy(sink, unlit, M, r):
    """A low stone bothy with a slate roof, a chimney and a lit window; its door (local -y) faces the camera."""
    L, W, H, R = 0.26, 0.18, 0.11, 0.09
    stone_c, dark = col(HL['stoneLit']), col(HL['stoneShade'])
    box(sink, M, (-L / 2, -W / 2, -0.02), (L / 2, W / 2, H), dark, stone_c)
    for x in (-L / 2, L / 2):
        sink.face(M, [(x, -W / 2, H), (x, W / 2, H), (x, 0, H + R)][::1 if x > 0 else -1], stone_c, double=True)
    over = 0.025
    for sgn in (1, -1):
        q = [(-L / 2 - over, sgn * (W / 2 + over), H - 0.015), (L / 2 + over, sgn * (W / 2 + over), H - 0.015), (L / 2 + over, 0, H + R), (-L / 2 - over, 0, H + R)]
        sink.face(M, q if sgn < 0 else q[::-1], col(HL['slate']), double=True)
    box(sink, M, (-L / 2 - 0.005, -0.02, H), (-L / 2 + 0.04, 0.02, H + R + 0.05), col('#8E8F88'), stone_c)  # chimney
    sink.face(M, [(-0.025, -W / 2 - 0.001, 0.0), (0.025, -W / 2 - 0.001, 0.0), (0.025, -W / 2 - 0.001, 0.08), (-0.025, -W / 2 - 0.001, 0.08)][::-1], col('#4E6A5A'))  # door
    unlit.face(M, [(0.06, -W / 2 - 0.002, 0.045), (0.095, -W / 2 - 0.002, 0.045), (0.095, -W / 2 - 0.002, 0.075), (0.06, -W / 2 - 0.002, 0.075)][::-1], col('#FFD98A'))
    base = (M @ Vector((0, 0, H + R + 0.05))).z
    with flowing(FLOW_SMOKE, lambda co: (co.z - base) * 6):  # chimney smoke, swaying more higher up
        for k in range(3):
            sink.blob(M, (-L / 2 + 0.02 + 0.02 * k, 0.01 * k, H + R + 0.08 + 0.05 * k), 0.014 + 0.007 * k, col('#F2F4F4'), col('#E0E5E6'), col('#C9D0D2'), subdiv=1, squash=0.8, jitter=0.1, seed=k, smooth=True)


def stone_bridge(sink, M, span, r):
    """A single humped stone arch over the burn, spanning local x."""
    w, rise, t = 0.07, span * 0.35, 0.03
    n = 8
    for k in range(n):
        u0, u1 = k / n, (k + 1) / n
        x0, x1 = -span / 2 - 0.06 + (span + 0.12) * u0, -span / 2 - 0.06 + (span + 0.12) * u1
        z0, z1 = rise * math.sin(math.pi * u0), rise * math.sin(math.pi * u1)
        deck = [(x0, -w / 2, z0 + t), (x1, -w / 2, z1 + t), (x1, w / 2, z1 + t), (x0, w / 2, z0 + t)]
        sink.face(M, deck, col(HL['stoneLit']))
        for y, flip in ((-w / 2, False), (w / 2, True)):
            ia = max(0.0, rise * math.sin(math.pi * min(1, max(0, (x0 + span / 2) / span))) - 0.005) if -span / 2 < x0 < span / 2 else 0.0
            ib = max(0.0, rise * math.sin(math.pi * min(1, max(0, (x1 + span / 2) / span))) - 0.005) if -span / 2 < x1 < span / 2 else 0.0
            q = [(x0, y, ia - 0.02), (x1, y, ib - 0.02), (x1, y, z1 + t), (x0, y, z0 + t)]
            sink.face(M, q[::-1] if flip else q, col(HL['stone']) if k % 2 else col(HL['stoneShade']))
        for y in (-w / 2, w / 2):  # parapet
            box(sink, M, (x0, y - 0.006, z0 + t), (x1, y + 0.006, z0 + t + 0.02), col(HL['stoneLit']), col(HL['stone']))


def drystone_wall(sink, pts, r):
    """A low drystone dyke through world points (layout x, y, z)."""
    for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0)
        yaw = math.atan2(-(z1 - z0), x1 - x0)
        M = frame(x0, z0, min(y0, y1) - 0.01, yaw)
        n = max(1, int(L / 0.03))
        for k in range(n):
            a, b = L * k / n, L * (k + 1) / n
            hh = r.uniform(0.035, 0.048)
            box(sink, M, (a, -0.014, 0), (b - 0.002, 0.014, hh), col(HL['stoneLit']) if k % 3 else col(HL['lichen']), col(HL['stone']) if k % 2 else col(HL['stoneShade']))


# ---------------------------------------------------------------------------------------------------------- placement

LOCH = None  # (x, z, shoreline radius per angle) once placed


def loch(ground, sink, unlit, keep_out):
    """Grows the lawn pool into a proper loch: each direction reaches as far as the lawn and trail allow, so the
    shoreline is irregular. Deep water in the middle shading to shallows, a pebbly shore, reeds, lily pads, and a
    jetty with a rowboat."""
    global LOCH
    pool = D['features']['pool']
    if not pool:
        return
    px, pz = pool['x'], pool['z']
    n = 64
    reach = []
    for k in range(n):
        a = 2 * math.pi * k / n
        r = pool['r'] * 0.8
        while r < 0.9:
            x, z = px + math.cos(a) * (r + 0.07), pz + math.sin(a) * (r + 0.07)
            gy, _ = ground.at(x, z)
            if gy is None or abs(gy - LEVEL_Y[LAWN]) > 0.005 or ground.trail_distance(x, z, LEVEL_Y[LAWN]) < HW + 0.06:
                break
            if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out):
                break
            r += 0.01
        reach.append(r)
    # smooth the reach (so the shore curves rather than zigzags), then add bays and points
    radii = []
    for k in range(n):
        avg = sum(reach[(k + j) % n] for j in range(-3, 4)) / 7
        r = min(avg, min(reach[(k + j) % n] for j in range(-1, 2)))
        a = 2 * math.pi * k / n
        r *= 0.93 + 0.07 * noise.noise(Vector((math.cos(a) * 2.5, math.sin(a) * 2.5, 6.2)))
        radii.append(max(pool['r'] * 0.8, r))
    LOCH = (px, pz, radii)
    y = LEVEL_Y[LAWN] + 0.004
    edge = [(px + math.cos(2 * math.pi * k / n) * radii[k], pz + math.sin(2 * math.pi * k / n) * radii[k]) for k in range(n)]
    centre = [(px, pz)] * n
    deep, mid, shallow, edge_c = col('#2F6C84'), col(HL['loch']), col(HL['lochMid']), col(HL['lochEdge'])
    rings = [(lerp_outline(edge, centre, 0.999), deep), (lerp_outline(edge, centre, 0.7), deep), (lerp_outline(edge, centre, 0.4), mid),
             (lerp_outline(edge, centre, 0.15), shallow), (lerp_outline(edge, centre, 0.04), edge_c), (edge, col(HL['mist']))]
    verts = [[unlit.bm.verts.new(P(x, y, z)) for x, z in pts] for pts, _ in rings]
    for rr in range(len(verts) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = unlit.bm.faces.new((verts[rr][i], verts[rr + 1][i], verts[rr + 1][j], verts[rr][j]))
            for loop in f.loops:
                loop[unlit.layer] = rings[rr][1] if loop.vert in (verts[rr][i], verts[rr][j]) else rings[rr + 1][1]
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
    # a few pale ripple streaks on the water, catching the light
    for k in range(5):
        a = rng.uniform(0, 2 * math.pi)
        d = loch_radius(a) * rng.uniform(0.2, 0.6)
        x, z = px + math.cos(a) * d, pz + math.sin(a) * d
        L = rng.uniform(0.06, 0.12)
        unlit.face(frame(x, z, y + 0.001, 0.3), [(-L / 2, -0.003, 0), (L / 2, -0.003, 0), (L / 2, 0.003, 0), (-L / 2, 0.003, 0)], col('#CFE7EA'))
    # pebbly shore
    for k in range(0, n):
        if rng.random() < 0.45:
            continue
        a = 2 * math.pi * k / n + rng.uniform(-0.03, 0.03)
        r = radii[k] + rng.uniform(-0.005, 0.03)
        x, z = px + math.cos(a) * r, pz + math.sin(a) * r
        c = col(rng.choice((HL['stoneLit'], HL['stone'], '#CFC6B0')))
        sink.blob(frame(x, z, y - 0.006), (0, 0, 0.003), rng.uniform(0.009, 0.018), c, mix(c, col('#000000'), 0.1), mix(c, col('#000000'), 0.2), subdiv=0, squash=0.5, jitter=0.15, seed=k)
    # reeds in clumps along the shallows
    for k in range(0, n, 5):
        if rng.random() < 0.4:
            continue
        a = 2 * math.pi * k / n
        r = radii[k] - 0.02
        x, z = px + math.cos(a) * r, pz + math.sin(a) * r
        M = frame(x, z, y - 0.004, rng.uniform(0, 6.3))
        for i in range(rng.randint(5, 8)):
            o = Vector((rng.uniform(-0.025, 0.025), rng.uniform(-0.025, 0.025), 0))
            lean = Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), 0))
            hh = rng.uniform(0.07, 0.12)
            sink.cyl(M, [tuple(o), tuple(o + lean * 0.5 + Vector((0, 0, hh * 0.6))), tuple(o + lean + Vector((0, 0, hh)))], [0.003, 0.0028, 0.0015], 3, [col('#7F9A55')])
            if rng.random() < 0.4:
                sink.cyl(M, [tuple(o + lean * 0.85 + Vector((0, 0, hh * 0.75))), tuple(o + lean * 0.95 + Vector((0, 0, hh * 0.9)))], [0.006, 0.006], 4, [col('#6A4A30')])
    # lily pads in a sheltered corner
    a0 = rng.uniform(0, 2 * math.pi)
    for k in range(7):
        a = a0 + rng.uniform(-0.4, 0.4)
        d = loch_radius(a) * rng.uniform(0.6, 0.85)
        x, z = px + math.cos(a) * d, pz + math.sin(a) * d
        rr = rng.uniform(0.014, 0.024)
        pts = [(math.cos(t) * rr, math.sin(t) * rr, 0) for t in [0.5 + 2 * math.pi * m / 9 * 0.92 for m in range(10)]] + [(0, 0, 0)]
        sink.face(frame(x, z, y + 0.002, rng.uniform(0, 6.3)), pts, col('#5E9A58'))
        if rng.random() < 0.4:
            sink.blob(frame(x, z, y + 0.006), (0, 0, 0), 0.006, col('#FFF4F4'), col('#F6C8D0'), col('#F6C8D0'), subdiv=0, jitter=0)
    # a short jetty on the camera side with a rowboat tied up
    best = None
    for k in range(n):
        a = 2 * math.pi * k / n
        if math.sin(a) < 0.3:
            continue
        x, z = px + math.cos(a) * (radii[k] + 0.1), pz + math.sin(a) * (radii[k] + 0.1)
        gy, _ = ground.at(x, z)
        if gy is None or abs(gy - LEVEL_Y[LAWN]) > 0.005 or ground.trail_distance(x, z, LEVEL_Y[LAWN]) < HW + 0.12:
            continue
        score = radii[k]
        if best is None or score > best[0]:
            best = (score, a, k)
    if best:
        _, a, k = best
        dx, dz = math.cos(a), math.sin(a)
        sx, sz = px + dx * (radii[k] + 0.08), pz + dz * (radii[k] + 0.08)
        yaw = math.atan2(-dz, dx)  # local +x points out from the loch centre
        J = frame(sx, sz, y, yaw)
        for m in range(6):  # planks running inward
            x0 = -m * 0.035
            sink.face(J, [(x0, -0.03, 0.02), (x0 - 0.03, -0.03, 0.02), (x0 - 0.03, 0.03, 0.02), (x0, 0.03, 0.02)], col(HL['bracken']) if m % 2 else col('#A07A52'))
        for x0 in (0.0, -0.1, -0.19):
            for yy in (-0.028, 0.028):
                sink.cyl(J, [(x0, yy, -0.03), (x0, yy, 0.03)], [0.005, 0.005], 4, [col('#6A4A30')])
        B = J @ Matrix.Translation((-0.16, 0.07, -0.005)) @ Matrix.Rotation(0.1, 4, 'Z')
        L2, W2 = 0.07, 0.028
        hull = [(-L2, 0, 0.012), (-L2 * 0.6, -W2, 0.014), (L2 * 0.6, -W2, 0.014), (L2, 0, 0.016), (L2 * 0.6, W2, 0.014), (-L2 * 0.6, W2, 0.014)]
        for i in range(len(hull)):
            p, q = hull[i], hull[(i + 1) % len(hull)]
            sink.face(B, [(p[0] * 0.7, p[1] * 0.5, -0.005), (q[0] * 0.7, q[1] * 0.5, -0.005), q, p], col('#7A4E34'), double=True)
        sink.face(B, [(p[0] * 0.8, p[1] * 0.8, 0.008) for p in hull], col('#B98A62'))
        sink.cyl(B, [(0, -W2 * 0.9, 0.012), (0, W2 * 0.9, 0.012)], [0.004, 0.004], 3, [col('#6A4A30')])  # thwart
        keep_out.append((sx, sz, 0.18))
    keep_out.append((px, pz, max(radii) + 0.1))
    keep_out.append((px, pz + 0.3, max(radii) * 0.8 + 0.15))  # keep tall trees out from in front of the loch
    print('loch', round(min(radii), 2), round(max(radii), 2))


def burn_and_bridge(ground, sink, unlit, keep_out):
    """A burn from the loch's far edge down to the sea, clear of the trail, with a stone bridge over it."""
    if not LOCH:
        return
    px, pz, _ = LOCH
    best = None
    for k in range(36):
        a = 2 * math.pi * k / 36
        dx, dz = math.cos(a), math.sin(a)
        pr = loch_radius(a)
        x, z = px + dx * (pr - 0.02), pz + dz * (pr - 0.02)
        length, clear = 0.0, 9.0
        while True:
            nx, nz = x + dx * 0.02, z + dz * 0.02
            gy, _ = ground.at(nx, nz)
            if gy is None:
                break
            clear = min(clear, ground.trail_distance(nx, nz, gy))
            x, z, length = nx, nz, length + 0.02
        if clear < HW + 0.15:
            continue
        score = -length + 0.3 * dz  # short run to the sea, preferably toward the camera
        if best is None or score > best[0]:
            best = (score, a, length)
    if not best:
        print('burn', None)
        return
    _, a, length = best
    dx, dz = math.cos(a), math.sin(a)
    pr = loch_radius(a)
    sx, sz = px + dx * (pr - 0.03), pz + dz * (pr - 0.03)
    STREAMS.append((sx, sz, sx + dx * length, sz + dz * length))
    cascade(ground, unlit, sx, sz, dx, dz)
    # the bridge over the lawn stretch of the burn
    for f in (0.45, 0.35, 0.55, 0.25):
        bx, bz = sx + dx * length * f, sz + dz * length * f
        gy, _ = ground.at(bx, bz)
        if gy is not None and abs(gy - LEVEL_Y[LAWN]) < 0.005:
            stone_bridge(sink, frame(bx, bz, gy - 0.004, math.atan2(-dz, dx) + math.pi / 2), 0.14, rng)
            keep_out.append((bx, bz, 0.14))
            break
    print('burn', round(length, 2))


def summit_castle(ground, sink, keep_out):
    top = LEVEL_Y[SUMMIT]
    cairn = next(p for p in D['props'] if p['kind'] == 'summitCairn')
    best = None
    for _ in range(4000):
        x, z = rng.uniform(-3, 3), rng.uniform(-3, 3)
        gy, _ = ground.at(x, z)
        if gy is None or abs(gy - top) > 0.004 or math.hypot(x - cairn['x'], z - cairn['z']) < 0.3:
            continue
        room = 0.0
        for rr in (0.14, 0.18, 0.22, 0.26, 0.3):
            if not ground.flat(x, z, top, rr) or ground.trail_distance(x, z, top) < HW + rr + 0.02 or math.hypot(x - cairn['x'], z - cairn['z']) < rr + 0.2:
                break
            room = rr
        if room < 0.14 or ground.blocks_trail(x, z, top, room * 1.3):
            continue
        score = room - 0.2 * z
        if best is None or score > best[0]:
            best = (score, x, z, room)
    if not best:
        print('castle', None)
        return
    _, x, z, room = best
    castle(sink, frame(x, z, top - 0.004, rng.uniform(-0.3, 0.3)), room * 0.95, rng)
    keep_out.append((x, z, room + 0.08))
    print('castle', round(room, 2))


def walls_and_sheep(ground, sink, keep_out):
    """Two short drystone dykes following the lawn and tier contours, and a few sheep."""
    made = 0
    for level in (LAWN, TIER):
        pts = outline(level, 4)
        ns = outward_normals(pts)
        y = LEVEL_Y[level]
        start = rng.randrange(len(pts))
        for off in range(len(pts)):
            i = (start + off) % len(pts)
            run = []
            for j in range(7):
                k = (i + j) % len(pts)
                x, z = pts[k][0] - ns[k][0] * 0.22, pts[k][1] - ns[k][1] * 0.22
                gy, _ = ground.at(x, z)
                if gy is None or abs(gy - y) > 0.005 or ground.trail_distance(x, z, y) < HW + 0.1 or any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out):
                    break
                run.append((x, gy, z))
            if len(run) >= 5:
                drystone_wall(sink, run, rng)
                for x, _, z in run:
                    keep_out.append((x, z, 0.06))
                made += 1
                break
    sheep_made = 0
    for _ in range(400):
        if sheep_made >= 6:
            break
        x, z = rng.uniform(-2.8, 2.8), rng.uniform(-2.8, 2.8)
        gy, _ = ground.at(x, z)
        if gy is None or level_of(gy) not in ('lawn', 'tier') or ground.trail_distance(x, z, gy) < HW + 0.1 or not ground.flat(x, z, gy, 0.05):
            continue
        if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out):
            continue
        sheep(sink, frame(x, z, gy - 0.003, rng.uniform(0, 6.3), scale=1.3), 0.05, rng)
        keep_out.append((x, z, 0.08))
        sheep_made += 1
    print('walls', made, 'sheep', sheep_made)


def crag_stacks(sink):
    I = Matrix.Identity(4)
    for pl in D['features']['pillars']:
        sides, rings = pl['sides'], 5
        y0, y1 = pl['baseY'] - 0.05, pl['topY']
        radii = [pl['r'] * (1.1 - 0.25 * k / rings + 0.05 * math.sin(k * 2.7 + pl['rot'])) for k in range(rings + 1)]
        for k in range(rings):
            ya, yb = y0 + (y1 - y0) * k / rings, y0 + (y1 - y0) * (k + 1) / rings
            for i in range(sides):
                ta, tb = pl['rot'] + 2 * math.pi * i / sides, pl['rot'] + 2 * math.pi * (i + 1) / sides
                q = [(ta, ya, radii[k]), (tb, ya, radii[k]), (tb, yb, radii[k + 1]), (ta, yb, radii[k + 1])]
                c = stone(pl['x'] + math.cos(ta) * 0.1, (ya + yb) / 2, pl['z'] + math.sin(ta) * 0.1)
                sink.face(I, [tuple(P(pl['x'] + r * math.cos(t), yy, pl['z'] + r * math.sin(t))) for t, yy, r in q][::-1], c)
        cap = [P(pl['x'] + radii[-1] * math.cos(pl['rot'] + 2 * math.pi * i / sides), y1, pl['z'] + radii[-1] * math.sin(pl['rot'] + 2 * math.pi * i / sides)) for i in range(sides)]
        sink.face(I, [tuple(v) for v in cap], col(HL['moss']))
        heather(sink, frame(pl['x'], pl['z'], y1), 0.05, rng)


def sea_rocks(sink, unlit):
    for wr in D['features']['waterRocks']:
        boulder(sink, frame(wr['x'], wr['z'], -0.05, wr['rot']), wr['r'] * 1.2, rng)
        pts = [(math.cos(2 * math.pi * k / 14), math.sin(2 * math.pi * k / 14)) for k in range(14)]
        M = frame(wr['x'], wr['z'], -0.034)
        r0, r1 = wr['r'] * 0.8, wr['r'] * 1.4
        for k in range(14):
            a, b = pts[k], pts[(k + 1) % 14]
            unlit.face(M, [(a[0] * r0, a[1] * r0, 0), (a[0] * r1, a[1] * r1, 0), (b[0] * r1, b[1] * r1, 0), (b[0] * r0, b[1] * r0, 0)][::-1], col(PAL['foam']))


def layout_props(ground, sink, unlit):
    camp = next((p for p in D['props'] if p['kind'] == 'campfire'), None)
    for p in D['props']:
        y, _ = ground.at(p['x'], p['z'])
        y = p['y'] if y is None else y
        k = p['kind']
        if k == 'tent':
            toward_fire = math.atan2(-(camp['z'] - p['z']), camp['x'] - p['x']) if camp else -math.pi / 2
            yaw = 0.3 * math.atan2(math.sin(toward_fire + math.pi / 2), math.cos(toward_fire + math.pi / 2))
            bothy(sink, unlit, frame(p['x'], p['z'], y, yaw), rng)
        elif k == 'campfire':
            campfire(sink, unlit, frame(p['x'], p['z'], y), rng)
        elif k == 'summitCairn':
            summit_cairn(sink, frame(p['x'], p['z'], y), rng)
        elif k == 'signpost':
            signpost(sink, frame(p['x'], p['z'], y, p['rotY']), rng)


def landmark_keep_out():
    keep_out = []
    for p in D['props']:
        if p['kind'] in ('tent', 'campfire', 'signpost', 'summitCairn'):
            keep_out.append((p['x'], p['z'], 0.34 if p['kind'] == 'tent' else 0.22))
    for pl in D['features']['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.1))
    return keep_out


# kind: (builder, count, height range, levels, trail clearance, spacing, edge clearance, tall)
KINDS = [
    ('pine', scots_pine, 16, (0.5, 0.72), ('lawn', 'tier', 'summit'), 0.28, 0.3, 0.08, True),
    ('gorse', gorse, 12, (0.1, 0.15), ('lawn', 'tier', 'summit'), 0.18, 0.15, 0.04, False),
    ('heather', heather, 30, (0.05, 0.08), ('lawn', 'tier', 'summit'), 0.14, 0.1, 0.02, False),
    ('bracken', bracken, 14, (0.06, 0.09), ('lawn', 'tier'), 0.16, 0.12, 0.02, False),
    ('boulder', boulder, 12, (0.08, 0.16), ('lawn', 'tier', 'summit', 'beach'), 0.2, 0.2, 0.05, False),
    ('grass', grass_tuft, 30, (0.05, 0.08), ('beach', 'lawn', 'tier', 'summit'), 0.12, 0.08, 0.0, False),
]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain(crag_offset, rings=24, step=1)
    carve_path(terrain)
    carve_caves(terrain)
    tessellate_tops(terrain, target=0.14)
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    keep_out = landmark_keep_out()
    loch(ground, sink, unlit_sink, keep_out)  # before colouring, so the moor greens up around it
    colour_terrain(terrain, hl_cap, hl_lip, hl_cliff)
    smooth_shade(terrain)
    ground = Ground(terrain)
    layout_props(ground, sink, unlit_sink)
    crag_stacks(sink)
    burn_and_bridge(ground, sink, unlit_sink, keep_out)
    summit_castle(ground, sink, keep_out)
    walls_and_sheep(ground, sink, keep_out)
    sea_rocks(sink, unlit_sink)
    path_stones(ground, sink)
    rim_fringe(ground, sink, grass_tuft)
    scatter(ground, sink, unlit_sink, KINDS, keep_out)
    finish(terrain, sink, unlit_sink, sun_angle=12)


main()
