"""Builds the hand-made reef island (public/models/ReefIsland.glb) in Blender from the exported layout.

  npm run island:export -- reef
  python scripts/blender/reef_island.py assets-raw/reef-layout.json assets-raw/ReefIsland.raw.glb   (bpy module)
  npm run island:pack -- reef

Low coral-pink limestone cliffs over white beaches, a lagoon with coral heads, a small wreck on the reef, coconut
palms, stilt huts and a lighthouse on the summit. The shared pipeline lives in island_core.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import island_core  # noqa: E402

island_core.init('reef')
from island_core import *  # noqa: E402,F401,F403

REEF = {
    'sand': '#F7E4BE', 'sandLight': '#FCEFD2', 'sandShade': '#EED3A2', 'wetSand': '#E3CFA8',
    'grass': '#9AD07F', 'grassLight': '#B4DE8E', 'grassDark': '#78B86A',
    'coral': '#E98B78', 'coralLit': '#F4A690', 'coralShade': '#D0735F', 'lime': '#F5D3B8', 'limeShade': '#E6B89C',
    'notch': '#B8665A', 'wet': '#94574F', 'rim': '#FAE2CC',
    'wood': '#B98A62', 'woodDark': '#8C6446', 'woodLight': '#D4AC80', 'thatch': '#D9B36A', 'thatchDark': '#B8914C',
    'deep': '#3FA8B0', 'lagoon': '#7FD6D2', 'lagoonEdge': '#BDEBE2',
}
CORALS = ['#F28C7C', '#F6B26B', '#E57AA0', '#F7D07A', '#C98BDB', '#FF9E80']
PAL.update({'sand': REEF['sand'], 'sandWall': '#EFD3A4', 'path': '#FFF4DE', 'pathEdge': '#EEDDBB', 'tread': REEF['wood']})
FOL.update({'campfireStone': '#D9CFC0', 'log': REEF['wood'], 'stumpInner': REEF['woodLight'], 'ember': '#F2A25C'})
PALM = {'trunk': col('#B98A62'), 'ring': col('#A0714C'), 'frond': col('#4E9A6E'), 'tip': col('#8DD08C'),
        'nut': col('#7A5A3A'), 'nutDark': col('#5C4230')}


# ---------------------------------------------------------------------------------------------------------- terrain

def reef_offset(level, seed):
    """Soft, pitted limestone: a wave-cut notch near the foot, three gentle beds and a rounded overhanging rim."""
    lo = LEVEL_Y[level - 1]
    hi = LEVEL_Y[level]

    def off(i, f, y):
        if y >= hi - 1e-6:
            return 0.0
        a = 2 * math.pi * i / 128
        h = (y - lo) / (hi - lo)
        pits = noise.noise(Vector((math.cos(a) * 14 + seed, math.sin(a) * 14, h * 4)))
        lumps = noise.noise(Vector((math.cos(a) * 4 - seed, math.sin(a) * 4, h * 1.5)))
        d = 0.012 * pits + 0.03 * lumps + 0.012 * math.sin(h * 3 * math.pi * 2 + seed)
        d -= 0.045 * math.exp(-((h - 0.2) / 0.12) ** 2)  # wave-cut notch
        d += 0.05 * max(0.0, 1 - h * 6)  # apron at the foot; linear, so it meets the ground at an angle
        if h > 0.9:
            d = 0.018  # rounded rim standing proud
        return d

    return off


def sand_colour(x, z):
    n = noise.noise(Vector((x * 1.4, z * 1.4, 3.3))) * 0.7 + noise.noise(Vector((x * 5, z * 5, 6.1))) * 0.3
    return mix(col(REEF['sand']), col(REEF['sandLight']) if n > 0 else col(REEF['sandShade']), min(1.0, abs(n) * 1.5))


def lagoon_green(x, z):
    pool = D['features']['pool']
    if not pool:
        return 0.0
    d = math.hypot(x - pool['x'], z - pool['z']) - pool['r'] * 1.2
    edge = 0.26 + 0.08 * noise.noise(Vector((x * 5, z * 5, 3.3)))
    return max(0.0, min(1.0, (edge - d) / 0.08))


def reef_cap(co):
    x, y, z = co.x, co.z, -co.y
    n = noise.noise(Vector((x * 1.2, z * 1.2, 9.4)))
    if y < LEVEL_Y[LAWN] + 0.05:
        # white sand lawn with grassy patches and a green ring around the lagoon
        g = max(lagoon_green(x, z), max(0.0, min(1.0, (n - 0.15) * 4)))
    else:
        g = max(0.0, min(1.0, (n + 0.45) * 2.5))  # the terrace tops are mostly grass, with sandy scalds
    k = sand_colour(x, z)
    if g > 0:
        m = noise.noise(Vector((x * 6, z * 6, 1.3)))
        k = mix(k, col(REEF['grassLight']) if m > 0.1 else col(REEF['grass']) if m > -0.3 else col(REEF['grassDark']), g)
    return k


def reef_lip(x, y, z, n1, n2):
    return col(PAL['sandWall'], 0.97 + 0.05 * n2)


def reef_cliff(level, h, n1, n2, x, y, z):
    band = int(h * 3)
    tone = ['coral', 'lime', 'coralLit'][(band + level) % 3]
    k = col(REEF[tone], 0.94 + 0.08 * (0.5 + 0.5 * n2))
    if n1 > 0.35:
        k = mix(k, col(REEF['limeShade']), 0.5)  # pale weathered patches
    if h < 0.09:
        k = col(REEF['wet'], 0.95 + 0.1 * n2)  # dark tide line at the foot
    elif h < 0.3:
        k = mix(col(REEF['notch']), k, (h - 0.09) / 0.21)  # shaded wave-cut notch
    elif h > 0.9:
        k = col(REEF['rim'])
    return k


# ---------------------------------------------------------------------------------------------------------- plants

def coconut_palm(sink, M, h, r):
    palm(sink, M, h, r, PALM)


def tropical_bush(sink, M, h, r):
    rr = h * r.uniform(0.6, 0.75)
    sink.blob(M, (0, 0, rr * 0.7), rr, col('#8FD08A'), col('#5FB27A'), col('#3F8A62'), subdiv=2, squash=0.8, jitter=0.05, seed=r.uniform(0, 50), smooth=True)
    if r.random() < 0.6:  # hibiscus flowers
        for k in range(3):
            a = r.uniform(0, 2 * math.pi)
            p = Vector((math.cos(a) * rr * 0.8, math.sin(a) * rr * 0.8, rr * 0.9))
            c = col(r.choice(('#F2627A', '#F6A9A0', '#F7C35F')))
            sink.blob(M, p, 0.014, c, c, c, subdiv=0, jitter=0)


def beach_grass(sink, M, h, r):
    for i in range(6):
        a = 2 * math.pi * i / 6 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.01
        tip = d * h * 0.5 + Vector((0, 0, h * r.uniform(0.8, 1.15)))
        sink.face(M, [-s2, s2, tip], col('#A9C878') if i % 2 else col('#7FB26A'), double=True)


def fern_frond_plant(sink, M, h, r):
    n = r.randint(6, 8)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.25, 0.25)
        frond(sink, M, (0, 0, 0.005), yaw, h * r.uniform(1.4, 1.8), h * 0.28, r.uniform(1.0, 1.4), r.uniform(1.1, 1.4),
              col('#4E9A6E'), col('#9AD07F'), segs=4)


def rock(sink, M, h, r):
    sink.blob(M, (0, 0, h * 0.3), h * 0.7, col(REEF['lime']), col(REEF['coralLit']), col(REEF['coralShade']), subdiv=1, squash=0.6, jitter=0.2, seed=r.uniform(0, 50))


def coral_head(sink, M, size, r):
    """A clump of coral: a brain-coral dome, branching fingers and a fan."""
    c = col(r.choice(CORALS))
    c2 = col(r.choice(CORALS))
    sink.blob(M, (0, 0, 0), size, c, mix(c, col('#FFFFFF'), 0.15), mix(c, col('#000000'), 0.25), subdiv=1, squash=0.6, jitter=0.25, seed=r.uniform(0, 50))
    for k in range(r.randint(3, 5)):  # branching fingers
        a = r.uniform(0, 2 * math.pi)
        base = Vector((math.cos(a) * size * 0.6, math.sin(a) * size * 0.6, size * 0.2))
        tip = base + Vector((math.cos(a) * size * 0.3, math.sin(a) * size * 0.3, size * r.uniform(0.7, 1.1)))
        sink.cyl(M, [tuple(base), tuple(tip)], [size * 0.12, size * 0.08], 4, [c2], cap_top=mix(c2, col('#FFFFFF'), 0.3))
    if r.random() < 0.5:  # sea fan
        a = r.uniform(0, math.pi)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = [d * size * math.cos(t) + Vector((0, 0, size * 0.2 + size * 1.1 * math.sin(t))) for t in [math.pi * k / 6 for k in range(7)]]
        sink.face(M, [(0, 0, size * 0.1)] + [tuple(p) for p in pts], col('#C98BDB'), double=True)


def shell(sink, M, r):
    c = col(r.choice(('#FBE3D6', '#F6C9B8', '#FFF4DA')))
    sink.blob(M, (0, 0, 0.006), 0.012, c, c, mix(c, col('#000000'), 0.15), subdiv=0, squash=0.5, jitter=0.1, seed=r.uniform(0, 9))


def starfish(sink, M, r):
    c = col(r.choice(('#F2855E', '#E86A6A', '#F6B26B')))
    pts = []
    for k in range(10):
        a = math.pi * k / 5
        rr = 0.028 if k % 2 == 0 else 0.01
        pts.append((math.cos(a) * rr, math.sin(a) * rr, 0.004))
    sink.face(M, pts, c)


# ---------------------------------------------------------------------------------------------------------- structures

def lighthouse(sink, unlit, M, r):
    """A white tower with red bands, a gallery, a glowing lantern room and a red cap."""
    H, R0, R1 = 0.46, 0.07, 0.05
    white, red = col('#FAF4EA'), col('#E0564A')
    rings = 6
    for k in range(rings):
        z0, z1 = H * k / rings, H * (k + 1) / rings
        ra, rb = R0 + (R1 - R0) * k / rings, R0 + (R1 - R0) * (k + 1) / rings
        sink.cyl(M, [(0, 0, z0), (0, 0, z1)], [ra, rb], 10, [red if k % 2 else white])
    box(sink, M, (-R0 * 1.3, -R0 * 1.3, -0.01), (R0 * 1.3, R0 * 1.3, 0.03), col('#D9CFC0'), col('#C4B8A6'))  # plinth
    sink.cyl(M, [(0, 0, H), (0, 0, H + 0.015)], [R1 * 1.6, R1 * 1.6], 10, [col('#3E4A52')], cap_top=col('#5A6770'))  # gallery
    for k in range(10):  # railing posts
        a = 2 * math.pi * k / 10
        sink.cyl(M, [(math.cos(a) * R1 * 1.5, math.sin(a) * R1 * 1.5, H + 0.015), (math.cos(a) * R1 * 1.5, math.sin(a) * R1 * 1.5, H + 0.04)], [0.003, 0.003], 3, [col('#3E4A52')])
    glow = col('#FFE9A0')
    for k in range(8):  # lantern glass, unlit so it glows
        a0, a1 = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8
        rr = R1 * 0.85
        unlit.face(M, [(math.cos(a0) * rr, math.sin(a0) * rr, H + 0.015), (math.cos(a1) * rr, math.sin(a1) * rr, H + 0.015),
                       (math.cos(a1) * rr, math.sin(a1) * rr, H + 0.07), (math.cos(a0) * rr, math.sin(a0) * rr, H + 0.07)], glow, double=True)
    sink.cyl(M, [(0, 0, H + 0.07), (0, 0, H + 0.075)], [R1 * 1.1, R1 * 1.1], 10, [red])
    tip = (0, 0, H + 0.13)
    for k in range(10):  # conical cap
        a0, a1 = 2 * math.pi * k / 10, 2 * math.pi * (k + 1) / 10
        sink.face(M, [(math.cos(a0) * R1 * 1.1, math.sin(a0) * R1 * 1.1, H + 0.075), (math.cos(a1) * R1 * 1.1, math.sin(a1) * R1 * 1.1, H + 0.075), tip], red)
    sink.face(M, [(-0.018, R0 + 0.0005 - 0.003, 0.03), (0.018, R0 - 0.003, 0.03), (0.018, R0 - 0.004, 0.09), (-0.018, R0 - 0.004, 0.09)][::-1], col('#6A4A38'))  # door
    for k in range(2):
        z = H * (0.45 + 0.25 * k)
        rr = R0 + (R1 - R0) * z / H + 0.001
        sink.face(M, [(-0.012, -rr, z), (0.012, -rr, z), (0.012, -rr, z + 0.03), (-0.012, -rr, z + 0.03)], col('#4A5A66'))  # windows


def thatch_roof(sink, M, w, d, z, peak, over=0.03):
    """A four-sided thatched roof over a w×d footprint (centred), eaves at z."""
    a, b = w / 2 + over, d / 2 + over
    top = (0, 0, z + peak)
    corners = [(-a, -b, z), (a, -b, z), (a, b, z), (-a, b, z)]
    for i in range(4):
        p, q = corners[i], corners[(i + 1) % 4]
        sink.face(M, [p, q, top], col(REEF['thatch']) if i % 2 == 0 else col(REEF['thatchDark']), double=True)
        for k in range(1, 3):  # thatch courses
            t = k / 3
            pa = tuple(p[j] + (top[j] - p[j]) * t for j in range(3))
            qa = tuple(q[j] + (top[j] - q[j]) * t for j in range(3))
            sink.cyl(M, [pa, qa], [0.003, 0.003], 3, [col(REEF['thatchDark'])])


def stilt_hut(sink, M, r, stilts=0.12, deck=True):
    """A small plank hut on stilts with a thatched roof and a front deck (local -y faces the camera)."""
    w, d, h = 0.2, 0.17, 0.12
    wood, dark, light = col(REEF['wood']), col(REEF['woodDark']), col(REEF['woodLight'])
    for x in (-w / 2, w / 2):
        for y in (-d / 2 - (0.08 if deck else 0), d / 2):
            sink.cyl(M, [(x, y, -0.06), (x, y, stilts + 0.01)], [0.008, 0.008], 4, [dark])
    box(sink, M, (-w / 2 - 0.01, -d / 2 - (0.09 if deck else 0.0), stilts), (w / 2 + 0.01, d / 2 + 0.01, stilts + 0.015), light, wood)  # platform
    box(sink, M, (-w / 2 + 0.01, -d / 2 + 0.01, stilts + 0.015), (w / 2 - 0.01, d / 2 - 0.01, stilts + 0.015 + h), col('#E8D2B0'), wood)  # walls
    sink.face(M, [(-0.025, -d / 2 + 0.009, stilts + 0.016), (0.025, -d / 2 + 0.009, stilts + 0.016), (0.025, -d / 2 + 0.009, stilts + 0.09), (-0.025, -d / 2 + 0.009, stilts + 0.09)], dark)  # door
    sink.face(M, [(0.045, -d / 2 + 0.009, stilts + 0.06), (0.075, -d / 2 + 0.009, stilts + 0.06), (0.075, -d / 2 + 0.009, stilts + 0.09), (0.045, -d / 2 + 0.009, stilts + 0.09)], col('#5A7F92'))  # window
    thatch_roof(sink, M, w, d, stilts + 0.015 + h, 0.1)
    if deck:  # rail on the deck and a ladder down
        for x in (-w / 2, w / 2):
            sink.cyl(M, [(x, -d / 2 - 0.085, stilts + 0.015), (x, -d / 2 - 0.085, stilts + 0.06)], [0.004, 0.004], 3, [dark])
        sink.cyl(M, [(-w / 2, -d / 2 - 0.085, stilts + 0.06), (w / 2, -d / 2 - 0.085, stilts + 0.06)], [0.004, 0.004], 3, [wood])


def pier(sink, M, length, r):
    """A plank boardwalk on posts running along local -y from the origin."""
    wood, dark = col(REEF['wood']), col(REEF['woodDark'])
    n = int(length / 0.045)
    for k in range(n):
        y0 = -k * 0.045
        sink.face(M, [(-0.045, y0, 0.045), (0.045, y0, 0.045), (0.045, y0 - 0.038, 0.045), (-0.045, y0 - 0.038, 0.045)][::-1], wood if k % 2 else col(REEF['woodLight']))
        if k % 4 == 0:
            for x in (-0.045, 0.045):
                sink.cyl(M, [(x, y0, -0.06), (x, y0, 0.06)], [0.006, 0.006], 4, [dark])


def wreck(sink, M, r):
    """A small sailing boat run aground on the reef, heeled over, bow up, with a broken mast."""
    wood, dark, light = col(REEF['wood']), col(REEF['woodDark']), col(REEF['woodLight'])
    L, B, D2 = 0.42, 0.13, 0.1
    T = M @ Matrix.Rotation(0.45, 4, 'X') @ Matrix.Rotation(-0.12, 4, 'Y')
    stations = 7
    rings = []
    for i in range(stations):
        u = i / (stations - 1)
        x = -L / 2 + L * u
        beam = B * math.sin(math.pi * min(0.97, 0.12 + u * 0.88)) ** 0.7
        sheer = D2 + 0.03 * (2 * u - 1) ** 2
        rings.append([(x, -beam, sheer), (x, -beam * 0.85, sheer * 0.35), (x, 0, 0), (x, beam * 0.85, sheer * 0.35), (x, beam, sheer)])
    for i in range(stations - 1):
        if i == 2:
            continue  # a stove-in plank run
        for k in range(4):
            q = [rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]]
            sink.face(T, q, (wood if k % 2 else dark) if (i + k) % 3 else light, double=True)
    for i in (2,):  # the hole shows ribs
        for k in range(3):
            x = -L / 2 + L * (i + 0.3 * (k + 1)) / (stations - 1)
            sink.cyl(T, [(x, -B * 0.8, D2), (x, 0, 0.005), (x, B * 0.8, D2)], [0.004] * 3, 3, [dark])
    sink.face(T, [(L * 0.1, -B * 0.7, D2 * 0.8), (L * 0.35, -B * 0.4, D2 * 0.9), (L * 0.35, B * 0.4, D2 * 0.9), (L * 0.1, B * 0.7, D2 * 0.8)], light)  # deck
    sink.cyl(T, [(0.02, 0, 0.03), (0.02, 0, 0.26)], [0.008, 0.006], 5, [dark])  # broken mast
    sink.cyl(T, [(0.02, 0, 0.2), (0.14, 0.02, 0.17)], [0.004, 0.004], 4, [wood])  # yard
    sail = col('#EFE4CE')
    sink.face(T, [(0.02, 0.005, 0.24), (0.13, 0.03, 0.17), (0.08, 0.04, 0.06), (0.03, 0.01, 0.08)], sail, double=True)  # torn sail


# ---------------------------------------------------------------------------------------------------------- placement

def lagoon(ground, sink, unlit, keep_out):
    """The lawn pool as a turquoise lagoon with coral heads, a sandy rim and a grassy fringe."""
    pool = D['features']['pool']
    if not pool:
        return
    px, pz, pr = pool['x'], pool['z'], pool['r'] * 1.2
    y = LEVEL_Y[LAWN] + 0.004
    n = 44
    edge = []
    for k in range(n):
        a = 2 * math.pi * k / n
        wob = 1 + 0.12 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 7.7)))
        edge.append((px + math.cos(a) * pr * wob, pz + math.sin(a) * pr * wob))
    centre = [(px, pz)] * n
    rings = [(lerp_outline(edge, centre, 0.999), col(REEF['deep'])), (lerp_outline(edge, centre, 0.55), col(REEF['lagoon'])),
             (lerp_outline(edge, centre, 0.12), col(REEF['lagoonEdge'])), (edge, mix(col(REEF['lagoonEdge']), col(REEF['sandLight']), 0.6))]
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
    for k in range(6):  # coral heads showing through the water
        a = 2 * math.pi * k / 6 + rng.uniform(-0.3, 0.3)
        d = pr * rng.uniform(0.25, 0.65)
        coral_head(sink, frame(px + math.cos(a) * d, pz + math.sin(a) * d, y - 0.006, rng.uniform(0, 6.3)), rng.uniform(0.032, 0.046), rng)
    keep_out.append((px, pz, pr + 0.1))
    made = 0
    for _ in range(200):  # palms around the far side, a fringe of grass and flowers
        if made >= 4:
            break
        a = rng.uniform(math.pi, 2 * math.pi)  # layout -z side, away from the camera
        d = pr + rng.uniform(0.1, 0.24)
        x, z = px + math.cos(a) * d, pz + math.sin(a) * d
        gy, _ = ground.at(x, z)
        h = rng.uniform(0.5, 0.7)
        if gy is None or level_of(gy) != 'lawn' or ground.trail_distance(x, z, gy) < HW + 0.2 or ground.blocks_trail(x, z, gy, h * 0.8):
            continue
        if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out[:-1]):
            continue
        coconut_palm(sink, frame(x, z, gy - 0.004, 0) @ Matrix.Rotation(math.atan2(-(z - pz), x - px), 4, 'Z'), h, rng)
        keep_out.append((x, z, 0.12))
        made += 1


def summit_lighthouse(ground, sink, unlit, keep_out):
    top = LEVEL_Y[SUMMIT]
    cairn = next(p for p in D['props'] if p['kind'] == 'summitCairn')
    best = None
    for _ in range(3000):
        x, z = rng.uniform(-3, 3), rng.uniform(-3, 3)
        gy, _ = ground.at(x, z)
        if gy is None or abs(gy - top) > 0.004 or ground.trail_distance(x, z, gy) < HW + 0.14:
            continue
        if math.hypot(x - cairn['x'], z - cairn['z']) < 0.32 or not ground.flat(x, z, top, 0.12) or ground.blocks_trail(x, z, top, 0.6):
            continue
        score = -z + 0.5 * min(ground.trail_distance(x, z, top), 0.5)  # toward the back, in open ground
        if best is None or score > best[0]:
            best = (score, x, z)
    if best:
        _, x, z = best
        lighthouse(sink, unlit, frame(x, z, top - 0.004, rng.uniform(-0.3, 0.3)), rng)
        keep_out.append((x, z, 0.16))
        # a little keeper's cottage beside it
        for a in [rng.uniform(0, 2 * math.pi) for _ in range(20)]:
            cx, cz = x + math.cos(a) * 0.24, z + math.sin(a) * 0.24
            gy, _ = ground.at(cx, cz)
            if gy is None or abs(gy - top) > 0.004 or not ground.flat(cx, cz, top, 0.12) or ground.trail_distance(cx, cz, top) < HW + 0.14:
                continue
            if math.hypot(cx - cairn['x'], cz - cairn['z']) < 0.3 or ground.blocks_trail(cx, cz, top, 0.25):
                continue
            stilt_hut(sink, frame(cx, cz, top - 0.004, rng.uniform(-0.4, 0.4)), rng, stilts=0.02, deck=False)
            keep_out.append((cx, cz, 0.16))
            break
    print('lighthouse', best is not None)


def shore(ground, sink, unlit):
    """Coral heads in the shallows (the layout's sea rocks), a stilt hut with a pier and a wreck on the reef."""
    for wr in D['features']['waterRocks']:
        M = frame(wr['x'], wr['z'], -0.05, wr['rot'])
        coral_head(sink, M, wr['r'] * 0.7, rng)
        pts = [(math.cos(2 * math.pi * k / 14), math.sin(2 * math.pi * k / 14)) for k in range(14)]
        M2 = frame(wr['x'], wr['z'], -0.034)
        r0, r1 = wr['r'] * 0.7, wr['r'] * 1.3
        for k in range(14):
            a, b = pts[k], pts[(k + 1) % 14]
            unlit.face(M2, [(a[0] * r0, a[1] * r0, 0), (a[0] * r1, a[1] * r1, 0), (b[0] * r1, b[1] * r1, 0), (b[0] * r0, b[1] * r0, 0)][::-1], col(PAL['foam']))
    beach = outline(BEACH, 2)
    ns = outward_normals(beach)
    start = D['trail']['samples'][0]
    # score beach points: facing the camera (+z) but off to one side of the trail start
    scored = []
    for i, (x, z) in enumerate(beach):
        nx, nz = ns[i]
        off = math.hypot(x - start[0], z - start[2])
        if off < 0.9 or ground.trail_distance(x, z, 0.04) < 0.5:
            continue
        scored.append((nz + 0.2 * min(off, 2.0), i))
    scored.sort(reverse=True)
    used = []
    for _, i in scored:  # stilt hut standing in the water, joined to the beach by a pier
        x, z = beach[i]
        nx, nz = ns[i]
        hx, hz = x + nx * 0.28, z + nz * 0.28
        if any(math.hypot(hx - ux, hz - uz) < 0.8 for ux, uz in used):
            continue
        pier(sink, frame(x - nx * 0.05, z - nz * 0.05, 0.0, math.atan2(-nz, nx) + math.pi / 2), 0.26, rng)
        stilt_hut(sink, frame(hx, hz, -0.03, math.atan2(-nz, nx) + math.pi / 2), rng)
        used.append((hx, hz))
        if len(used) >= 1:
            break
    for _, i in scored[len(scored) // 3:]:  # the wreck, on the reef off a different stretch of beach
        x, z = beach[i]
        nx, nz = ns[i]
        wx, wz = x + nx * 0.35, z + nz * 0.35
        if any(math.hypot(wx - ux, wz - uz) < 1.0 for ux, uz in used) or nz < 0.1:
            continue
        wreck(sink, frame(wx, wz, -0.07, math.atan2(-nz, nx) + 0.6), rng)
        used.append((wx, wz))
        for k in range(10):  # foam around the hull
            a = 2 * math.pi * k / 10
            unlit.face(frame(wx, wz, -0.034), [(math.cos(a) * 0.2, math.sin(a) * 0.12, 0), (math.cos(a + 0.63) * 0.2, math.sin(a + 0.63) * 0.12, 0),
                                                 (math.cos(a + 0.63) * 0.26, math.sin(a + 0.63) * 0.17, 0), (math.cos(a) * 0.26, math.sin(a) * 0.17, 0)], col(PAL['foam']))
        break


def beach_details(ground, sink):
    pts = outline(BEACH, 3)
    ns = outward_normals(pts)
    idx = list(range(len(pts)))
    rng.shuffle(idx)
    made = 0
    for i in idx:
        if made >= 22:
            break
        x, z = pts[i]
        nx, nz = ns[i]
        d = rng.uniform(0.06, 0.2)
        px, pz = x - nx * d, z - nz * d
        gy, _ = ground.at(px, pz)
        if gy is None or abs(gy - LEVEL_Y[BEACH]) > 0.005 or ground.trail_distance(px, pz, gy) < HW + 0.1:
            continue
        M = frame(px, pz, gy - 0.002, rng.uniform(0, 6.3))
        k = made % 5
        if k in (0, 1):
            shell(sink, M, rng)
        elif k == 2:
            starfish(sink, M, rng)
        elif k == 3:
            rock(sink, frame(px, pz, gy - 0.01), rng.uniform(0.05, 0.09), rng)
        else:
            L = 0.22
            sink.cyl(frame(px, pz, gy - 0.02, rng.uniform(0, 6.3)), [(-L / 2, 0, 0.025), (L / 2, 0, 0.022)], [0.022, 0.018], 6, [col('#D8C7A8')], cap_top=col('#EDE0C6'))
        made += 1


def layout_props(ground, sink, unlit):
    for p in D['props']:
        y, _ = ground.at(p['x'], p['z'])
        y = p['y'] if y is None else y
        k = p['kind']
        if k == 'tent':
            stilt_hut(sink, frame(p['x'], p['z'], y, rng.uniform(-0.25, 0.25)), rng, stilts=0.05)
        elif k == 'campfire':
            campfire(sink, unlit, frame(p['x'], p['z'], y), rng)
        elif k == 'summitCairn':
            summit_cairn(sink, frame(p['x'], p['z'], y), rng)
        elif k == 'signpost':
            signpost(sink, frame(p['x'], p['z'], y, p['rotY']), rng)


def sea_stacks(sink):
    """The layout's pillars as coral-limestone stacks with a tuft of green on top."""
    I = Matrix.Identity(4)
    for pl in D['features']['pillars']:
        sides, rings = pl['sides'], 5
        y0, y1 = pl['baseY'] - 0.05, pl['topY']
        radii = [pl['r'] * (1.05 - 0.25 * math.exp(-((k / rings - 0.2) / 0.15) ** 2) + 0.05 * math.sin(k * 2.1 + pl['rot'])) for k in range(rings + 1)]
        for k in range(rings):
            ya, yb = y0 + (y1 - y0) * k / rings, y0 + (y1 - y0) * (k + 1) / rings
            tone = REEF[['wet', 'notch', 'coral', 'lime', 'coralLit'][k]]
            for i in range(sides):
                ta, tb = pl['rot'] + 2 * math.pi * i / sides, pl['rot'] + 2 * math.pi * (i + 1) / sides
                q = [(ta, ya, radii[k]), (tb, ya, radii[k]), (tb, yb, radii[k + 1]), (ta, yb, radii[k + 1])]
                sink.face(I, [tuple(P(pl['x'] + r * math.cos(t), yy, pl['z'] + r * math.sin(t))) for t, yy, r in q][::-1], col(tone, 0.93 + 0.1 * ((i * 5) % 3) / 2))
        cap = [P(pl['x'] + radii[-1] * math.cos(pl['rot'] + 2 * math.pi * i / sides), y1, pl['z'] + radii[-1] * math.sin(pl['rot'] + 2 * math.pi * i / sides)) for i in range(sides)]
        sink.face(I, [tuple(v) for v in cap], col(REEF['grass']))
        fern_frond_plant(sink, frame(pl['x'], pl['z'], y1), 0.06, rng)


def landmark_keep_out():
    keep_out = []
    for p in D['props']:
        if p['kind'] in ('tent', 'campfire', 'signpost', 'summitCairn'):
            keep_out.append((p['x'], p['z'], 0.36 if p['kind'] == 'tent' else 0.22))
    for pl in D['features']['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.1))
    return keep_out


# kind: (builder, count, height range, levels, trail clearance, spacing, edge clearance, tall)
KINDS = [
    ('palm', coconut_palm, 13, (0.5, 0.72), ('beach', 'lawn', 'tier'), 0.26, 0.28, 0.0, True),
    ('bush', tropical_bush, 20, (0.12, 0.18), ('lawn', 'tier', 'summit'), 0.2, 0.15, 0.04, False),
    ('fern', fern_frond_plant, 18, (0.06, 0.09), ('lawn', 'tier', 'summit'), 0.18, 0.1, 0.02, False),
    ('grass', beach_grass, 30, (0.06, 0.1), ('beach', 'lawn', 'tier', 'summit'), 0.14, 0.08, 0.0, False),
    ('rock', rock, 8, (0.08, 0.14), ('lawn', 'tier', 'beach'), 0.22, 0.25, 0.05, False),
]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain(reef_offset, rings=18, step=1)
    carve_path(terrain)
    carve_caves(terrain)
    tessellate_tops(terrain, target=0.16)
    colour_terrain(terrain, reef_cap, reef_lip, reef_cliff)
    smooth_shade(terrain)
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    keep_out = landmark_keep_out()
    layout_props(ground, sink, unlit_sink)
    sea_stacks(sink)
    lagoon(ground, sink, unlit_sink, keep_out)
    summit_lighthouse(ground, sink, unlit_sink, keep_out)
    shore(ground, sink, unlit_sink)
    path_stones(ground, sink)
    beach_details(ground, sink)
    rim_fringe(ground, sink, beach_grass)
    scatter(ground, sink, unlit_sink, KINDS, keep_out)
    finish(terrain, sink, unlit_sink, sun_angle=12)


main()
