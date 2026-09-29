"""Builds the hand-made desert island (public/models/DesertIsland.glb) in Blender from the exported layout.

  npm run island:export -- desert
  python scripts/blender/desert_island.py assets-raw/desert-layout.json assets-raw/DesertIsland.raw.glb   (bpy module)
  npm run island:pack -- desert

Sand dunes on the beach and lawn, layered red-rock mesa cliffs on the tier and summit, a palm-fringed oasis on the
lawn, cacti and dry scrub, a desert camp and stone ruins at the summit. The shared pipeline lives in island_core.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import island_core  # noqa: E402

island_core.init('desert')
from island_core import *  # noqa: E402,F401,F403

# Desert tones on top of the layout palette: redder mesa strata than the stub palette, dune sands, oasis greens.
DESERT = {
    'dune': '#EBC48A', 'duneLight': '#F5D9A6', 'duneShade': '#D6A468', 'duneDeep': '#C8935A',
    'mesaTop': '#D8955F', 'mesaSand': '#E6B47C', 'mesaDark': '#C27E50',
    'rock': '#C8744C', 'rockLit': '#D88A5C', 'rockPale': '#E9B78A', 'rockShade': '#B0613F', 'rockDeep': '#9C5236',
    'rockBase': '#86472F', 'crack': '#5C2E21', 'caprock': '#A85A3A',
    'sandstone': '#D9B48A', 'sandstoneDark': '#BF9368',
}
# The path is pale packed sand with sandstone treads and edge stones.
PAL.update({'path': '#F2E0B8', 'pathEdge': '#DEC596', 'tread': '#D6B98E', 'sandWall': '#E0B878'})
FOL.update({'campfireStone': '#CDB89C', 'log': '#9A7550', 'stumpInner': '#DDBE8E', 'ember': '#F2A25C'})

WIND = math.radians(-20)  # dunes and ripples run across this direction (layout xz)
STRATA = 7  # bands per cliff level


# ---------------------------------------------------------------------------------------------------------- terrain

def strata_band(h, x=0.0, z=0.0):
    """Which rock band a height fraction falls in; bands dip very slightly across the island."""
    return int(max(0.0, min(0.999, h + 0.012 * (x * 0.6 + z * 0.4))) * STRATA)


# per-band in/out (layout units): hard beds stand proud, soft beds recess
BAND_STEP = [0.028, -0.004, 0.018, -0.012, 0.03, 0.002, 0.02]


def mesa_offset(level, seed):
    lo = LEVEL_Y[level - 1]
    hi = LEVEL_Y[level]

    def off(i, f, y):
        if y >= hi - 1e-6:
            return 0.0
        a = 2 * math.pi * i / 128
        h = (y - lo) / (hi - lo)
        band = strata_band(h)
        flutes = noise.noise(Vector((math.cos(a) * 11 + seed, math.sin(a) * 11, band * 0.7)))
        blocks = noise.noise(Vector((math.cos(a) * 3 - seed, math.sin(a) * 3, h * 2.5)))
        d = BAND_STEP[(band + int(seed)) % STRATA] + 0.012 * flutes + 0.02 * blocks
        # wind-eroded notches: a soft bed hollowed out along part of the wall
        if band % 3 == 1:
            d -= 0.035 * max(0.0, noise.noise(Vector((math.cos(a) * 4 + seed, math.sin(a) * 4, band))) * 1.8)
        # talus spreads the foot; the caprock stands a little proud of the rim
        d += 0.07 * max(0.0, 1 - h * 3.2) ** 2
        if h > 0.94:
            d = 0.012
        return d

    return off


def dune_colour(x, z, lit=0.0):
    """Wind ripples: bands across the wind, warped so they wander, over a slow light/shade drift."""
    ux, uz = math.cos(WIND), math.sin(WIND)
    u = x * ux + z * uz + 0.18 * noise.noise(Vector((x * 1.3, z * 1.3, 2.4)))
    ripple = math.sin(u * 2 * math.pi / 0.3)
    drift = noise.noise(Vector((x * 0.8, z * 0.8, 7.7)))
    k = mix(col(DESERT['dune']), col(DESERT['duneLight']) if drift + lit > 0 else col(DESERT['duneShade']), min(1.0, abs(drift + lit) * 1.4))
    return mix(k, col(DESERT['duneLight']) if ripple > 0 else col(DESERT['duneShade']), 0.4 * abs(ripple) ** 0.6)


def oasis_green(x, z):
    """0..1 how green the ground is around the oasis pool, with a ragged edge."""
    pool = D['features']['pool']
    if not pool:
        return 0.0
    d = math.hypot(x - pool['x'], z - pool['z']) - pool['r']
    edge = 0.34 + 0.08 * noise.noise(Vector((x * 5, z * 5, 3.3)))
    return max(0.0, min(1.0, (edge - d) / 0.1))


OASIS = {'grass': '#8DBF6A', 'grassDark': '#6FA35A', 'grassLight': '#A8CF7C'}


def desert_cap(co):
    x, y, z = co.x, co.z, -co.y
    if y < LEVEL_Y[LAWN] + 0.05:
        k = dune_colour(x, z)
        g = oasis_green(x, z)
        if g > 0:
            n = noise.noise(Vector((x * 6, z * 6, 1.1)))
            k = mix(k, col(OASIS['grassLight']) if n > 0 else col(OASIS['grass']), g)
        return k
    # mesa tops: wind-scoured rock with drifts of orange sand
    n = noise.noise(Vector((x * 1.6, z * 1.6, 5.5))) * 0.7 + noise.noise(Vector((x * 4.5, z * 4.5, 8.1))) * 0.3
    k = mix(col(DESERT['mesaTop']), col(DESERT['mesaSand']) if n > 0 else col(DESERT['mesaDark']), min(1.0, abs(n) * 1.5))
    return k


def desert_lip(x, y, z, n1, n2):
    return col(PAL['sandWall'], 0.97 + 0.05 * n2)


BAND_TONES = ['rock', 'rockPale', 'rockLit', 'rockShade', 'rockPale', 'rock', 'rockLit']


def desert_cliff(level, h, n1, n2, x, y, z):
    band = strata_band(h, x, z)
    tone = BAND_TONES[(band + (0 if level == TIER else 2)) % STRATA]
    k = col(DESERT[tone], 0.94 + 0.08 * (0.5 + 0.5 * n2))
    if h < 0.1:
        k = col(DESERT['crack'] if n2 > 0.45 else DESERT['rockBase'], 0.95 + 0.1 * n1)
    elif h > 0.94:
        k = col(DESERT['caprock'])
    elif (h * STRATA) % 1 < 0.16:
        k = mix(k, col(DESERT['rockDeep']), 0.45)  # shadow line under each proud bed
    return k


# ---------------------------------------------------------------------------------------------------------- dunes

def dune(sink, x, z, y, length, width, height, yaw, seed):
    """A barchan: a long windward ramp up to a sharp crest line, a steep lee slip face, and horns that trail
    downwind (local +x). Built in rows across the wind so every row has a vertex exactly on the crest."""
    M = frame(x, z, y, yaw)
    rows, up, down = 13, 7, 4
    grid = []
    for j in range(rows):
        v = -0.96 + 1.92 * j / (rows - 1)
        w = math.sqrt(max(0.0, 1 - v * v))  # half-chord of the footprint across this row
        crest = (0.12 + 0.55 * v * v) * w  # the crest bows downwind towards the horns
        peak = height * (1 - v * v) ** 1.3
        row = []
        for i in range(up + down + 1):
            if i <= up:
                t = i / up
                u = -w + (crest + w) * t
                hh = peak * t ** 1.35  # the windward ramp steepens a little towards the crest
            else:
                t = (i - up) / down
                u = crest + (w * 0.92 - crest) * t
                hh = peak * (1 - t) ** 2.2 * (1 - 0.1 * t)  # the slip face falls away sharply
            if i in (0, up + down) or j in (0, rows - 1):
                hh = -0.012
            hh *= 1 + 0.06 * noise.noise(Vector((u * 2 + seed, v * 2, 0.5)))
            row.append(sink.bm.verts.new(M @ Vector((u * length / 2, v * width / 2, hh))))
        grid.append(row)
    faces = []
    n = up + down + 1
    for j in range(rows - 1):
        for i in range(n - 1):
            faces.append(sink.bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])))
    wind = Matrix.Rotation(yaw, 4, 'Z').to_3x3() @ Vector((1, 0, 0))
    for f in faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        lee = f.normal.dot(wind)  # faces looking downwind are the steep, shadowed slip face
        for loop in f.loops:
            c = loop.vert.co
            k = dune_colour(c.x, -c.y, 0.45 - 1.2 * max(0.0, lee))
            if lee > 0.25:
                k = mix(k, col(DESERT['duneDeep']), 0.5)
            loop[sink.layer] = k
    return faces


def place_dunes(ground, sink, keep_out, count=10):
    """Dunes on the lawn and drifts on the mesa top, away from the path, the oasis, landmarks and the rims."""
    pool = D['features']['pool']
    made = []
    for _ in range(1500):
        if len(made) >= count:
            break
        x, z = rng.uniform(-2.8, 2.8), rng.uniform(-2.8, 2.8)
        y, nz = ground.at(x, z)
        if y is None or level_of(y) not in ('lawn', 'tier'):
            continue
        length, width = rng.uniform(0.8, 1.3), rng.uniform(0.34, 0.5)
        yaw = -WIND + math.pi / 2 + rng.uniform(-0.35, 0.35)  # layout z is Blender -y, so angles flip
        reach = length / 2 + 0.05
        if ground.trail_distance(x, z, y) < HW + 0.15 + width / 2:
            continue
        if pool and math.hypot(x - pool['x'], z - pool['z']) < pool['r'] + 0.55 + reach * 0.6:
            continue
        if any(math.hypot(x - kx, z - kz) < kr + reach * 0.8 for kx, kz, kr in keep_out + made):
            continue
        ok = True
        for m in range(10):  # the whole footprint must sit on the lawn (a dune may lean on a cliff foot)
            t = 2 * math.pi * m / 10
            lx, lz = math.cos(t) * length / 2 * 0.85, math.sin(t) * width / 2 * 0.85
            px, pz = x + lx * math.cos(-yaw) - lz * math.sin(-yaw), z + lx * math.sin(-yaw) + lz * math.cos(-yaw)
            py, _ = ground.at(px, pz)
            if py is None or py < y - 0.005 or ground.trail_distance(px, pz, y) < HW + 0.12:
                ok = False
                break
        if not ok:
            continue
        dune(sink, x, z, y - 0.004, length, width, rng.uniform(0.09, 0.14), yaw, rng.uniform(0, 50))
        made.append((x, z, reach * 0.9))
    print('dunes', len(made))
    return made


# ---------------------------------------------------------------------------------------------------------- rock features

def hoodoos(sink, unlit):
    """The layout's pillars as banded sandstone hoodoos with a darker caprock; its sea rocks as sandstone boulders."""
    I = Matrix.Identity(4)
    for pl in D['features']['pillars']:
        sides = pl['sides']
        rings = 7
        y0, y1 = pl['baseY'] - 0.05, pl['topY']
        radii = [pl['r'] * (1.08 + 0.06 * math.sin(k * 2.3 + pl['rot'])) * (1.12 - 0.22 * k / rings) for k in range(rings + 1)]
        for k in range(rings):
            ya, yb = y0 + (y1 - y0) * k / rings, y0 + (y1 - y0) * (k + 1) / rings
            tone = DESERT[BAND_TONES[k % STRATA]]
            for i in range(sides):
                ta, tb = pl['rot'] + 2 * math.pi * i / sides, pl['rot'] + 2 * math.pi * (i + 1) / sides
                q = [(ta, ya, radii[k]), (tb, ya, radii[k]), (tb, yb, radii[k + 1]), (ta, yb, radii[k + 1])]
                pts = [P(pl['x'] + r * math.cos(t), yy, pl['z'] + r * math.sin(t)) for t, yy, r in q]
                sink.face(I, [tuple(v) for v in pts[::-1]], col(tone, 0.93 + 0.1 * ((i * 5) % 3) / 2))
        # caprock: a wider, darker slab
        M = frame(pl['x'], pl['z'], y1 - 0.01, pl['rot'])
        cap_r = pl['r'] * 1.25
        cap = [(math.cos(2 * math.pi * i / sides) * cap_r, math.sin(2 * math.pi * i / sides) * cap_r) for i in range(sides)]
        sink.cyl(M, [(0, 0, 0), (0, 0, 0.055)], [cap_r, cap_r * 0.92], sides, [col(DESERT['caprock'])], cap_top=col(DESERT['mesaTop']))
        sink.face(M, [(x, y, 0) for x, y in cap][::-1], col(DESERT['rockDeep']))
    for wr in D['features']['waterRocks']:
        sink.blob(frame(wr['x'], wr['z'], -0.05, wr['rot']), (0, 0, wr['height'] * 0.4), wr['r'], col(DESERT['sandstone']), col(DESERT['rockLit']), col(DESERT['rockShade']),
                  subdiv=1, squash=wr['height'] / wr['r'] * 0.8, jitter=0.15, seed=wr['x'] * 10)
        pts = [(math.cos(2 * math.pi * k / 14), math.sin(2 * math.pi * k / 14)) for k in range(14)]
        M = frame(wr['x'], wr['z'], -0.034)
        r0, r1 = wr['r'] * 0.8, wr['r'] * 1.5
        for k in range(14):
            a, b = pts[k], pts[(k + 1) % 14]
            unlit.face(M, [(a[0] * r0, a[1] * r0, 0), (a[0] * r1, a[1] * r1, 0), (b[0] * r1, b[1] * r1, 0), (b[0] * r0, b[1] * r0, 0)][::-1], col(PAL['foam']))


# ---------------------------------------------------------------------------------------------------------- plants

PLANT = {
    'cactus': '#6F9A58', 'cactusLit': '#8DB36A', 'cactusDark': '#557D45', 'spine': '#E9E0C0',
    'pad': '#7FA35A', 'padLit': '#9CBC6E', 'padDark': '#5E8446', 'fruit': '#D9587A', 'bloom': '#F4B55F',
    'shrub': '#8E9A5E', 'shrubLit': '#A9B172', 'shrubDark': '#687348', 'twig': '#8A6A4A',
    'dryGrass': '#CDBB72', 'dryGrassDark': '#B09E5A', 'reed': '#7FA35A', 'reedTip': '#B9B070',
}
DATE_PALM = {'trunk': col('#9C7A55'), 'ring': col('#84633F'), 'frond': col('#5F9150'), 'tip': col('#A2C46A'),
             'nut': col('#C0703A'), 'nutDark': col('#8A4A2A')}


def ribbed(sink, M, pts, radius, sides, light, dark, cap=None):
    """A ribbed tube (star cross-section, alternating rib colours) through local points; radius is per point."""
    rings = []
    for i, p in enumerate(pts):
        a = Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])
        a.normalize()
        ref = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
        u = a.cross(ref).normalized()
        v = a.cross(u).normalized()
        ring = []
        for k in range(sides * 2):
            t = math.pi * k / sides
            rr = radius[i] * (1.0 if k % 2 == 0 else 0.8)
            ring.append(sink.bm.verts.new(M @ (Vector(p) + (u * math.cos(t) + v * math.sin(t)) * rr)))
        rings.append(ring)
    n = sides * 2
    for i in range(len(rings) - 1):
        for k in range(n):
            f = sink.bm.faces.new((rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]))
            for loop in f.loops:
                loop[sink.layer] = light if k % 2 == 0 else dark
    if cap:
        top = sink.bm.verts.new(M @ (Vector(pts[-1]) + (Vector(pts[-1]) - Vector(pts[-2])).normalized() * radius[-1] * 0.8))
        for k in range(n):
            f = sink.bm.faces.new((rings[-1][k], rings[-1][(k + 1) % n], top))
            for loop in f.loops:
                loop[sink.layer] = cap


def saguaro(sink, M, h, r):
    rad = 0.04 * h / 0.45
    light, dark, lit = col(PLANT['cactus']), col(PLANT['cactusDark']), col(PLANT['cactusLit'])
    ribbed(sink, M, [(0, 0, -0.01), (0, 0, h * 0.5), (0, 0, h * 0.92)], [rad * 1.05, rad, rad * 0.95], 6, light, dark, cap=lit)
    arms = r.choice((1, 2, 2, 3))
    base_yaw = r.uniform(0, 2 * math.pi)
    for i in range(arms):
        yaw = base_yaw + math.pi * i + r.uniform(-0.4, 0.4) if arms < 3 else base_yaw + 2 * math.pi * i / 3
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        y0 = h * r.uniform(0.32, 0.55)
        out = rad * r.uniform(2.2, 3.0)
        up = h * r.uniform(0.18, 0.32)
        pts = [tuple(d * rad * 0.5 + Vector((0, 0, y0))), tuple(d * out * 0.75 + Vector((0, 0, y0 + 0.004))), tuple(d * out + Vector((0, 0, y0 + rad * 1.4))),
               tuple(d * out + Vector((0, 0, y0 + up)))]
        ribbed(sink, M, pts, [rad * 0.7] * 4, 5, light, dark, cap=lit)
    if r.random() < 0.5:  # a crown of blooms
        for k in range(3):
            a = 2 * math.pi * k / 3
            sink.blob(M, (math.cos(a) * rad * 0.6, math.sin(a) * rad * 0.6, h * 0.92 + rad * 0.7), rad * 0.35, col('#FFF4DA'), col('#FFF4DA'), col(PLANT['bloom']), subdiv=0, jitter=0)


def pad(sink, M, centre, yaw, tilt, size, seed):
    """One prickly-pear pad: a flattened oval standing on its edge."""
    L = M @ Matrix.Translation(Vector(centre)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Diagonal((1.0, 0.32, 1.25, 1.0))
    sink.blob(L, (0, 0, 0), size, col(PLANT['padLit']), col(PLANT['pad']), col(PLANT['padDark']), subdiv=1, jitter=0.06, seed=seed)
    return L


def prickly_pear(sink, M, h, r):
    s = h * 0.45
    base = [(0, 0, s * 0.9, r.uniform(0, math.pi), 0.0)]
    for i in range(2):
        base.append((r.uniform(-s, s) * 0.8, r.uniform(-s, s) * 0.5, s * 0.8, r.uniform(0, math.pi), r.uniform(-0.3, 0.3)))
    for x, y, z, yaw, tilt in base:
        L = pad(sink, M, (x, y, z), yaw, tilt, s, r.uniform(0, 50))
        for k in range(r.randint(1, 2)):  # pads growing from the rim
            a = r.uniform(-0.9, 0.9)
            L2 = L @ Matrix.Translation(Vector((math.sin(a) * s, 0, math.cos(a) * s * 1.1))) @ Matrix.Rotation(a * 0.6 + r.uniform(-0.3, 0.3), 4, 'Y') @ Matrix.Diagonal((1.0, 1 / 0.32, 1 / 1.25, 1.0))
            pad(sink, L2, (0, 0, s * 0.72), r.uniform(-0.5, 0.5), r.uniform(-0.2, 0.2), s * 0.75, r.uniform(0, 50))
            if r.random() < 0.6:
                sink.blob(L, (math.sin(a) * s * 1.02, 0, math.cos(a) * s * 1.25), s * 0.16, col(PLANT['fruit']), col(PLANT['fruit']), col(PLANT['fruit'], 0.8), subdiv=0, jitter=0)


def barrel(sink, M, h, r):
    rad = h * 0.55
    prof = [(0.0, 0.8), (0.3, 1.0), (0.65, 0.95), (0.9, 0.7)]
    ribbed(sink, M, [(0, 0, h * z - 0.01) for z, _ in prof], [rad * k for _, k in prof], 9, col(PLANT['cactusLit']), col(PLANT['cactusDark']), cap=col(PLANT['cactus']))
    bloom = col(PLANT['bloom']) if r.random() < 0.6 else col(PLANT['fruit'])
    for k in range(5):
        a = 2 * math.pi * k / 5
        sink.blob(M, (math.cos(a) * rad * 0.35, math.sin(a) * rad * 0.35, h * 0.95), rad * 0.2, bloom, bloom, col(PLANT['bloom'], 0.8), subdiv=0, jitter=0)


def dry_shrub(sink, M, h, r):
    rr = h * r.uniform(0.6, 0.75)
    sink.blob(M, (0, 0, rr * 0.55), rr, col(PLANT['shrubLit']), col(PLANT['shrub']), col(PLANT['shrubDark']), subdiv=2, squash=0.7, jitter=0.12, seed=r.uniform(0, 50), smooth=True)
    for k in range(4):  # a few bare twigs poking out
        a = 2 * math.pi * k / 4 + r.uniform(-0.4, 0.4)
        d = Vector((math.cos(a), math.sin(a), 0))
        sink.cyl(M, [(0, 0, rr * 0.3), tuple(d * rr * 1.25 + Vector((0, 0, rr * 1.1)))], [0.004, 0.002], 3, [col(PLANT['twig'])])


def desert_grass(sink, M, h, r):
    for i in range(6):
        a = 2 * math.pi * i / 6 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.01
        tip = d * h * 0.55 + Vector((0, 0, h * r.uniform(0.8, 1.15)))
        sink.face(M, [-s2, s2, tip], col(PLANT['dryGrass']) if i % 2 else col(PLANT['dryGrassDark']), double=True)


def oasis_grass(sink, M, h, r):
    for i in range(5):
        a = 2 * math.pi * i / 5 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.012
        tip = d * h * 0.4 + Vector((0, 0, h * r.uniform(0.8, 1.1)))
        sink.face(M, [-s2, s2, tip], col(OASIS['grassDark']) if i % 2 else col(OASIS['grassLight']), double=True)


def reeds(sink, M, h, r):
    for i in range(r.randint(5, 8)):
        o = Vector((r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 0))
        lean = Vector((r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 0))
        hh = h * r.uniform(0.7, 1.1)
        sink.cyl(M, [tuple(o), tuple(o + lean * 0.5 + Vector((0, 0, hh * 0.6))), tuple(o + lean + Vector((0, 0, hh)))], [0.004, 0.0035, 0.002], 3, [col(PLANT['reed'])])
        if r.random() < 0.5:  # bulrush head
            sink.cyl(M, [tuple(o + lean * 0.85 + Vector((0, 0, hh * 0.78))), tuple(o + lean * 0.95 + Vector((0, 0, hh * 0.92)))], [0.008, 0.008], 4, [col('#8A5A38')])


def desert_flower(sink, M, h, r):
    top = Vector((0, 0, h))
    sink.cyl(M, [(0, 0, 0), tuple(top)], [0.005, 0.004], 3, [col(OASIS['grassDark'])])
    petal = col(r.choice(('#F6A9A0', '#F4B55F', '#E88AA8')))
    for i in range(5):
        a = 2 * math.pi * i / 5
        d = Vector((math.cos(a), math.sin(a), 0.25))
        s2 = Vector((-math.sin(a), math.cos(a), 0)) * 0.016
        sink.face(M, [top, top + d * 0.028 + s2, top + d * 0.042, top + d * 0.028 - s2], petal, double=True)
    sink.blob(M, top + Vector((0, 0, 0.005)), 0.009, col('#FFF4DA'), col('#FFF4DA'), col('#FFF4DA'), subdiv=0, jitter=0)


def boulder(sink, M, h, r):
    sink.blob(M, (0, 0, h * 0.3), h * 0.7, col(DESERT['sandstone']), col(DESERT['rockLit']), col(DESERT['rockShade']), subdiv=1, squash=0.62, jitter=0.2, seed=r.uniform(0, 50))


# ---------------------------------------------------------------------------------------------------------- props

BONE = '#F1E9D6'
BONE_SHADE = '#D8CDB4'


def skull(sink, M, r):
    """A bleached longhorn skull lying on the sand, with a few ribs half-buried beside it."""
    bone, shade = col(BONE), col(BONE_SHADE)
    sink.blob(M, (0, 0, 0.022), 0.03, bone, bone, shade, subdiv=1, squash=0.75, jitter=0.05, seed=2)
    sink.blob(M @ Matrix.Diagonal((1.0, 1.7, 1.0, 1.0)), (0, -0.022, 0.016), 0.02, bone, bone, shade, subdiv=1, squash=0.7, jitter=0.05, seed=3)
    for sgn in (1, -1):  # horns sweep out and up
        pts = [(sgn * 0.022, 0.008, 0.03), (sgn * 0.06, 0.014, 0.036), (sgn * 0.09, 0.006, 0.058), (sgn * 0.1, -0.004, 0.08)]
        sink.cyl(M, pts, [0.009, 0.007, 0.005, 0.002], 5, [bone, bone, shade])
        sink.face(M, [(sgn * 0.012, -0.03, 0.03), (sgn * 0.02, -0.022, 0.031), (sgn * 0.016, -0.014, 0.033)][::sgn], col('#4A3A2E'))
    for k in range(4):  # ribs
        x = 0.12 + k * 0.03
        pts = [(x, -0.045, -0.004), (x + 0.004, -0.03, 0.03), (x + 0.006, 0.0, 0.042), (x + 0.004, 0.03, 0.03), (x, 0.045, -0.004)]
        sink.cyl(M, pts, [0.004] * 5, 4, [bone])
    sink.cyl(M, [(0.1, 0.0, 0.008), (0.24, 0.0, 0.01)], [0.006, 0.005], 5, [shade])  # spine


def box(sink, M, lo, hi, top, side, bottom=None):
    """Axis-aligned box in local frame between corners lo and hi."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    for idx, c in (((4, 5, 6, 7), top), ((0, 1, 5, 4), side), ((1, 2, 6, 5), side), ((2, 3, 7, 6), side), ((3, 0, 4, 7), side), ((3, 2, 1, 0), bottom or side)):
        sink.face(M, [v[i] for i in idx], c)


def bedouin_tent(sink, M, r):
    """A striped canvas awning on poles, open at the front, with a rug and guy ropes."""
    L, W, H, E = 0.42, 0.3, 0.22, 0.13  # length (local x), depth (y, back is +y), ridge and eave heights
    xs = [-L / 2, 0.0, L / 2]
    ys = [-W / 2, 0.0, W / 2]
    stripes = [col('#EFE0BE'), col('#B6533A')]
    shade = [col('#E0CFAA'), col('#9F4632')]
    height = {-W / 2: E, 0.0: H, W / 2: E * 0.9}
    # roof panels between pole rows, sagging between poles
    for j in range(2):
        ya, yb = ys[j], ys[j + 1]
        for i in range(2):
            xa, xb = xs[i], xs[i + 1]
            n = 4
            for k in range(n):
                u0, u1 = xa + (xb - xa) * k / n, xa + (xb - xa) * (k + 1) / n
                sag0 = 0.018 * math.sin(math.pi * k / n)
                sag1 = 0.018 * math.sin(math.pi * (k + 1) / n)
                c = (stripes if j == 0 else shade)[(i * n + k) % 2]
                sink.face(M, [(u0, ya, height[ya] - sag0), (u1, ya, height[ya] - sag1), (u1, yb, height[yb] - sag1 * 0.6), (u0, yb, height[yb] - sag0 * 0.6)], c, double=True)
    # back wall and a half-closed side
    sink.face(M, [(-L / 2, W / 2, 0), (L / 2, W / 2, 0), (L / 2, W / 2, E * 0.9), (-L / 2, W / 2, E * 0.9)], col('#CDB48A'), double=True)
    sink.face(M, [(-L / 2, W / 2, 0), (-L / 2, W / 2, E * 0.9), (-L / 2, 0, H), (-L / 2, -W / 4, 0)], col('#D9C29A'), double=True)
    for x in xs:
        for y in ys[:2]:
            sink.cyl(M, [(x, y, 0), (x, y, height[y] + 0.01)], [0.005, 0.005], 4, [col('#7A5A3E')])
    # guy ropes to stakes at the front corners
    for x in (-L / 2, L / 2):
        sink.cyl(M, [(x, -W / 2, E), (x * 1.25, -W / 2 - 0.08, 0.0)], [0.0015, 0.0015], 3, [col('#6A5040')])
    # rug with a border
    sink.face(M, [(-L / 2 + 0.02, -W / 2 - 0.06, 0.003), (L / 2 - 0.02, -W / 2 - 0.06, 0.003), (L / 2 - 0.02, W / 2 - 0.02, 0.003), (-L / 2 + 0.02, W / 2 - 0.02, 0.003)], col('#E3B25F'))
    sink.face(M, [(-L / 2 + 0.05, -W / 2 - 0.03, 0.004), (L / 2 - 0.05, -W / 2 - 0.03, 0.004), (L / 2 - 0.05, W / 2 - 0.05, 0.004), (-L / 2 + 0.05, W / 2 - 0.05, 0.004)], col('#A8443A'))
    for k in range(2):  # cushions
        sink.blob(M, (-0.08 + 0.16 * k, W / 2 - 0.06, 0.018), 0.028, col('#5B7FA3'), col('#4A6A8C'), col('#3C5670'), subdiv=1, squash=0.5, jitter=0.05, seed=k)


STONE = {'stone': '#E6D5B3', 'stoneLit': '#F1E4C6', 'stoneShade': '#CDB88F', 'stoneDark': '#B59E78'}


def stone(k=1.0, tone='stone'):
    return col(STONE[tone], k)


def column(sink, M, h, r, broken=True):
    rad = 0.035
    box(sink, M, (-rad * 1.5, -rad * 1.5, -0.01), (rad * 1.5, rad * 1.5, 0.025), stone(tone='stoneLit'), stone(tone='stoneShade'))
    top = h if not broken else h * r.uniform(0.35, 0.8)
    drums = max(1, int(top / 0.07))
    for k in range(drums):
        z0, z1 = 0.025 + (top - 0.025) * k / drums, 0.025 + (top - 0.025) * (k + 1) / drums
        ribbed(sink, M, [(0, 0, z0), (0, 0, z1)], [rad, rad * 0.97], 8, stone(0.98 + 0.04 * (k % 2)), stone(0.9, 'stoneShade'))
    if broken:  # a jagged break
        for k in range(5):
            a = 2 * math.pi * k / 5
            sink.face(M, [(0, 0, top + 0.012), (math.cos(a) * rad, math.sin(a) * rad, top + r.uniform(-0.01, 0.015)), (math.cos(a + 1.26) * rad, math.sin(a + 1.26) * rad, top + r.uniform(-0.01, 0.015))], stone(tone='stoneLit'))
    else:
        box(sink, M, (-rad * 1.45, -rad * 1.45, top), (rad * 1.45, rad * 1.45, top + 0.03), stone(tone='stoneLit'), stone(tone='stoneShade'))
    return top


def arch(sink, M, r):
    """Two piers and a round arch of voussoirs, spanning local x."""
    span, pier_h, t = 0.2, 0.2, 0.05
    for sgn in (-1, 1):
        x = sgn * (span / 2 + t / 2)
        box(sink, M, (x - t / 2 - 0.01, -t / 2 - 0.01, -0.01), (x + t / 2 + 0.01, t / 2 + 0.01, 0.025), stone(tone='stoneLit'), stone(tone='stoneShade'))
        for k in range(4):
            z0 = 0.025 + (pier_h - 0.025) * k / 4
            z1 = 0.025 + (pier_h - 0.025) * (k + 1) / 4
            j = 0.004 * (1 if (k + (sgn > 0)) % 2 else -1)
            box(sink, M, (x - t / 2 + j, -t / 2, z0), (x + t / 2 + j, t / 2, z1 - 0.002), stone(tone='stoneLit'), stone(0.97 + 0.05 * (k % 2)))
    n = 9
    R0, R1 = span / 2, span / 2 + t
    for k in range(n):
        if k == n - 2:
            continue  # one voussoir fallen out, the keystone holds by habit
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n - 0.02
        inner0, inner1 = (math.cos(a0) * R0, pier_h + math.sin(a0) * R0), (math.cos(a1) * R0, pier_h + math.sin(a1) * R0)
        outer0, outer1 = (math.cos(a0) * R1, pier_h + math.sin(a0) * R1), (math.cos(a1) * R1, pier_h + math.sin(a1) * R1)
        c = stone(0.97 + 0.05 * (k % 2))
        for y, flip in ((-t / 2, False), (t / 2, True)):
            q = [(inner0[0], y, inner0[1]), (inner1[0], y, inner1[1]), (outer1[0], y, outer1[1]), (outer0[0], y, outer0[1])]
            sink.face(M, q[::-1] if flip else q, c)
        sink.face(M, [(outer0[0], -t / 2, outer0[1]), (outer1[0], -t / 2, outer1[1]), (outer1[0], t / 2, outer1[1]), (outer0[0], t / 2, outer0[1])], stone(tone='stoneLit'))
        sink.face(M, [(inner0[0], t / 2, inner0[1]), (inner1[0], t / 2, inner1[1]), (inner1[0], -t / 2, inner1[1]), (inner0[0], -t / 2, inner0[1])], stone(tone='stoneShade'))
        sink.face(M, [(inner0[0], -t / 2, inner0[1]), (outer0[0], -t / 2, outer0[1]), (outer0[0], t / 2, outer0[1]), (inner0[0], t / 2, inner0[1])], stone(tone='stoneShade'))
        sink.face(M, [(inner1[0], t / 2, inner1[1]), (outer1[0], t / 2, outer1[1]), (outer1[0], -t / 2, outer1[1]), (inner1[0], -t / 2, inner1[1])], stone(tone='stoneShade'))


def fallen_block(sink, M, r):
    sx, sy, sz = r.uniform(0.05, 0.09), r.uniform(0.04, 0.06), r.uniform(0.035, 0.05)
    T = M @ Matrix.Rotation(r.uniform(-0.25, 0.25), 4, 'X') @ Matrix.Rotation(r.uniform(-0.25, 0.25), 4, 'Y')
    box(sink, T, (-sx / 2, -sy / 2, -0.012), (sx / 2, sy / 2, sz - 0.012), stone(tone='stoneLit'), stone(0.95), stone(tone='stoneDark'))


def fallen_drum(sink, M, r):
    L = r.uniform(0.06, 0.12)
    ribbed(sink, M, [(-L / 2, 0, 0.03), (L / 2, 0, 0.03)], [0.034, 0.034], 8, stone(), stone(0.9, 'stoneShade'), cap=stone(tone='stoneLit'))


# ---------------------------------------------------------------------------------------------------------- placement

def oasis(ground, sink, unlit, keep_out):
    """The lawn pool as an unlit spring-fed pool with a pale rim, ringed by date palms, reeds, grass and flowers."""
    pool = D['features']['pool']
    if not pool:
        return
    px, pz, pr = pool['x'], pool['z'], pool['r'] * 1.1
    y = LEVEL_Y[LAWN] + 0.004
    n = 40
    edge = [(px + math.cos(2 * math.pi * k / n) * pr * (1 + 0.1 * noise.noise(Vector((math.cos(2 * math.pi * k / n) * 2, math.sin(2 * math.pi * k / n) * 2, 4.4)))),
             pz + math.sin(2 * math.pi * k / n) * pr * (1 + 0.1 * noise.noise(Vector((math.cos(2 * math.pi * k / n) * 2, math.sin(2 * math.pi * k / n) * 2, 4.4))))) for k in range(n)]
    centre = [(px, pz)] * n
    deep, shallow, rim = col('#3FA3A8'), col('#8FD4D9'), col('#E9DDB6')
    unlit.bm.normal_update()
    unlit_obj_rings = [(lerp_outline(edge, centre, 0.999), deep), (lerp_outline(edge, centre, 0.55), mix(deep, shallow, 0.35)), (lerp_outline(edge, centre, 0.12), shallow), (edge, mix(shallow, rim, 0.6))]
    # write the rings into the unlit sink so they join the Unlit mesh
    verts = [[unlit.bm.verts.new(P(x, y, z)) for x, z in pts] for pts, _ in unlit_obj_rings]
    for rr in range(len(verts) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = unlit.bm.faces.new((verts[rr][i], verts[rr + 1][i], verts[rr + 1][j], verts[rr][j]))
            for loop in f.loops:
                loop[unlit.layer] = unlit_obj_rings[rr][1] if loop.vert in (verts[rr][i], verts[rr][j]) else unlit_obj_rings[rr + 1][1]
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
    # a pale wet-sand rim of flat stones
    for k in range(0, n, 3):
        x, z = edge[k]
        a = math.atan2(z - pz, x - px)
        sx, sz = x + math.cos(a) * 0.02, z + math.sin(a) * 0.02
        sink.blob(frame(sx, sz, y - 0.006), (0, 0, 0.004), rng.uniform(0.018, 0.028), col(DESERT['sandstone']), col(DESERT['sandstoneDark']), col(DESERT['sandstoneDark']), subdiv=0, squash=0.5, jitter=0.15, seed=k)
    keep_out.append((px, pz, pr + 0.12))
    # date palms around the far side, clear of the trail and not hiding it from the camera
    # far side and flanks only (layout -z is away from the camera), so the palms frame the pool instead of hiding it
    angles = sorted((k for k in range(12) if math.sin(2 * math.pi * k / 12) < 0.25), key=lambda k: rng.random())
    palms = 0
    for k in angles:
        if palms >= 5:
            break
        a = 2 * math.pi * k / 12 + rng.uniform(-0.15, 0.15)
        d = pr + rng.uniform(0.1, 0.24)
        x, z = px + math.cos(a) * d, pz + math.sin(a) * d
        gy, _ = ground.at(x, z)
        h = rng.uniform(0.5, 0.72)
        if gy is None or level_of(gy) != 'lawn' or ground.trail_distance(x, z, gy) < HW + 0.2 or ground.blocks_trail(x, z, gy, h * 0.8):
            continue
        if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out[:-1]):
            continue
        away = math.atan2(-(z - pz), x - px)
        palm(sink, frame(x, z, gy - 0.004, 0) @ Matrix.Rotation(away, 4, 'Z'), h, rng, DATE_PALM)
        keep_out.append((x, z, 0.12))
        palms += 1
    # reeds at the water's edge, grass and flowers in the green ring
    for k in range(0, n, 4):
        if rng.random() < 0.35:
            continue
        x, z = edge[k]
        a = math.atan2(z - pz, x - px)
        rx, rz = x + math.cos(a) * 0.015, z + math.sin(a) * 0.015
        if ground.trail_distance(rx, rz, y) > HW + 0.1:
            reeds(sink, frame(rx, rz, y - 0.004, rng.uniform(0, 6.3)), rng.uniform(0.09, 0.14), rng)
    made = 0
    for _ in range(200):
        if made >= 16:
            break
        a = rng.uniform(0, 2 * math.pi)
        d = pr + rng.uniform(0.05, 0.36)
        x, z = px + math.cos(a) * d, pz + math.sin(a) * d
        gy, _ = ground.at(x, z)
        if gy is None or level_of(gy) != 'lawn' or oasis_green(x, z) < 0.5 or ground.trail_distance(x, z, gy) < HW + 0.08:
            continue
        M = frame(x, z, gy - 0.004, rng.uniform(0, 6.3))
        if made % 3 == 2:
            desert_flower(sink, M, rng.uniform(0.07, 0.1), rng)
        else:
            oasis_grass(sink, M, rng.uniform(0.06, 0.1), rng)
        made += 1


def summit_ruins(ground, sink, keep_out):
    """Broken columns, one standing arch and fallen blocks on the summit, clear of the trail end and the cairn."""
    top = LEVEL_Y[SUMMIT]
    cairn = next(p for p in D['props'] if p['kind'] == 'summitCairn')
    spots = []
    for _ in range(3000):
        x, z = rng.uniform(-3, 3), rng.uniform(-3, 3)
        gy, nz = ground.at(x, z)
        if gy is None or abs(gy - top) > 0.004 or ground.trail_distance(x, z, gy) < HW + 0.1:
            continue
        if math.hypot(x - cairn['x'], z - cairn['z']) < 0.3:
            continue
        spots.append((x, z))
    spot_set = spots
    placed = []

    def free(x, z, r):
        return all(math.hypot(x - px, z - pz) > r + pr for px, pz, pr in placed)

    def ok(x, z, r):
        gy, _ = ground.at(x, z)
        return (gy is not None and abs(gy - top) < 0.004 and ground.trail_distance(x, z, top) > HW + 0.06 + r * 0.5
                and math.hypot(x - cairn['x'], z - cairn['z']) > 0.26 + r and ground.flat(x, z, top, r * 0.8))

    # the arch first: the flattest open spot furthest back from the camera, spanning across the view
    best = None
    for x, z in spot_set:
        if not ground.flat(x, z, top, 0.17) or ground.blocks_trail(x, z, top, 0.3):
            continue
        score = -z + 0.3 * min(ground.trail_distance(x, z, top), 0.6)
        if best is None or score > best[0]:
            best = (score, x, z)
    anchors = []  # things rubble falls around
    if best:
        _, x, z = best
        arch(sink, frame(x, z, top - 0.004, 0.25 * rng.uniform(-1, 1)), rng)
        placed.append((x, z, 0.16))
        keep_out.append((x, z, 0.22))
        anchors.append((x, z, 0.17))
    made = {'column': 0, 'wall': 0, 'block': 0, 'drum': 0}
    rng.shuffle(spots)
    # standing and broken columns, loosely in a colonnade row
    for x, z in spots:
        if made['column'] >= 6:
            break
        if not free(x, z, 0.1) or not ok(x, z, 0.06):
            continue
        h = rng.uniform(0.18, 0.34)
        if ground.blocks_trail(x, z, top, h):
            continue
        column(sink, frame(x, z, top - 0.004, rng.uniform(0, 2 * math.pi)), h, rng, broken=made['column'] > 0)
        placed.append((x, z, 0.06))
        keep_out.append((x, z, 0.1))
        anchors.append((x, z, 0.06))
        made['column'] += 1
    # a low broken wall: a short run of uneven courses
    for x, z in spots:
        if made['wall'] >= 1:
            break
        yaw = rng.uniform(0, math.pi)
        ends = [(x + math.cos(yaw) * d, z - math.sin(yaw) * d) for d in (-0.16, 0.0, 0.16)]
        if not all(free(ex, ez, 0.05) and ok(ex, ez, 0.04) for ex, ez in ends):
            continue
        M = frame(x, z, top - 0.004, yaw)
        for c in range(3):
            n_blocks = 4 - c
            for k in range(n_blocks):
                if c > 0 and rng.random() < 0.3:
                    continue
                x0 = -0.17 + 0.34 * k / 4 + c * 0.02 + rng.uniform(-0.005, 0.005)
                box(sink, M, (x0, -0.022, -0.01 + c * 0.04), (x0 + 0.08, 0.022, 0.028 + c * 0.04), stone(tone='stoneLit'), stone(0.95 + 0.06 * ((k + c) % 2)), stone(tone='stoneDark'))
        for ex, ez in ends:
            placed.append((ex, ez, 0.05))
        keep_out.append((x, z, 0.24))
        anchors.append((x, z, 0.12))
        made['wall'] += 1
    # rubble: fallen blocks and column drums lying around the anchors, then anywhere left
    near = []
    for ax, az, ar in anchors:
        for _ in range(12):
            a = rng.uniform(0, 2 * math.pi)
            d = ar + rng.uniform(0.07, 0.16)
            near.append((ax + math.cos(a) * d, az + math.sin(a) * d))
    for x, z in near + spots:
        if made['block'] >= 9 and made['drum'] >= 4:
            break
        kind = 'drum' if made['drum'] < 4 and (made['block'] >= 9 or rng.random() < 0.35) else 'block'
        r = 0.05 if kind == 'drum' else 0.04
        if not free(x, z, r + 0.015) or not ok(x, z, r):
            continue
        M = frame(x, z, top - 0.004, rng.uniform(0, 2 * math.pi))
        (fallen_drum if kind == 'drum' else fallen_block)(sink, M, rng)
        placed.append((x, z, r))
        keep_out.append((x, z, r + 0.03))
        made[kind] += 1
    print('ruins', made, 'arch', best is not None)


def beach_details(ground, sink):
    """Bleached driftwood and sandstone rocks along the beach."""
    pts = outline(BEACH, 4)
    ns = outward_normals(pts)
    idx = list(range(len(pts)))
    rng.shuffle(idx)
    made = 0
    for i in idx:
        if made >= 7:
            break
        x, z = pts[i]
        nx, nz = ns[i]
        px, pz = x - nx * 0.12, z - nz * 0.12
        gy, _ = ground.at(px, pz)
        if gy is None or abs(gy - LEVEL_Y[BEACH]) > 0.005 or ground.trail_distance(px, pz, gy) < 0.3:
            continue
        yaw = math.atan2(nz, nx) + rng.uniform(-0.6, 0.6)
        M = frame(px, pz, gy - 0.02, yaw)
        if made % 3 == 0:
            L = 0.28
            sink.cyl(M, [(-L / 2, 0, 0.03), (0, 0.01, 0.035), (L / 2, 0, 0.028)], [0.03, 0.028, 0.022], 6, [col('#CDBB9C'), col('#BBA887')], cap_top=col('#E3D5B8'))
            sink.cyl(M, [(0.02, 0.0, 0.04), (0.08, 0.06, 0.07)], [0.012, 0.006], 4, [col('#CDBB9C')])
        else:
            boulder(sink, frame(px, pz, gy - 0.01), rng.uniform(0.06, 0.11), rng)
        made += 1


def layout_props(ground, sink, unlit):
    camp = next((p for p in D['props'] if p['kind'] == 'campfire'), None)
    for p in D['props']:
        y, _ = ground.at(p['x'], p['z'])
        y = p['y'] if y is None else y
        k = p['kind']
        if k == 'tent':
            # open front (local -y) toward the default camera, turned a little toward the fire
            toward_fire = math.atan2(-(camp['z'] - p['z']), camp['x'] - p['x']) if camp else -math.pi / 2
            yaw = 0.3 * math.atan2(math.sin(toward_fire + math.pi / 2), math.cos(toward_fire + math.pi / 2))
            bedouin_tent(sink, frame(p['x'], p['z'], y, yaw), rng)
        elif k == 'campfire':
            campfire(sink, unlit, frame(p['x'], p['z'], y), rng)
        elif k == 'summitCairn':
            summit_cairn(sink, frame(p['x'], p['z'], y), rng)
        elif k == 'signpost':
            signpost(sink, frame(p['x'], p['z'], y, p['rotY']), rng)


def place_skull(ground, sink, keep_out):
    """One skull by the path on the lawn, where the camera sees it."""
    s = D['trail']['samples']
    ns = normals_along()
    for i in rng.sample(range(len(s)), len(s)):
        if abs(s[i][1] - LEVEL_Y[LAWN]) > 0.003:
            continue
        side = rng.choice((1, -1))
        x, z = s[i][0] + ns[i][0] * side * (HW + 0.13), s[i][2] + ns[i][1] * side * (HW + 0.13)
        gy, _ = ground.at(x, z)
        if gy is None or level_of(gy) != 'lawn' or not ground.flat(x, z, gy, 0.12) or ground.trail_distance(x, z, gy) < HW + 0.1:
            continue
        if any(math.hypot(x - kx, z - kz) < kr + 0.12 for kx, kz, kr in keep_out):
            continue
        skull(sink, frame(x, z, gy - 0.003, rng.uniform(0, 2 * math.pi)), rng)
        keep_out.append((x, z, 0.2))
        return


# kind: (builder, count, height range, levels, trail clearance, spacing, edge clearance, tall)
KINDS = [
    ('saguaro', saguaro, 11, (0.34, 0.52), ('lawn', 'tier', 'summit'), 0.26, 0.32, 0.06, True),
    ('pear', prickly_pear, 14, (0.12, 0.18), ('lawn', 'tier', 'summit'), 0.2, 0.2, 0.05, False),
    ('barrel', barrel, 14, (0.06, 0.09), ('lawn', 'tier', 'summit'), 0.17, 0.14, 0.03, False),
    ('shrub', dry_shrub, 14, (0.08, 0.13), ('lawn', 'tier', 'summit'), 0.18, 0.2, 0.04, False),
    ('boulder', boulder, 12, (0.08, 0.16), ('lawn', 'tier', 'summit'), 0.22, 0.2, 0.05, False),
    ('grass', desert_grass, 40, (0.06, 0.1), ('lawn', 'tier', 'summit', 'beach'), 0.14, 0.08, 0.0, False),
]


# ---------------------------------------------------------------------------------------------------------- main

def landmark_keep_out():
    keep_out = []
    for p in D['props']:
        if p['kind'] in ('tent', 'campfire', 'signpost', 'summitCairn'):
            keep_out.append((p['x'], p['z'], 0.36 if p['kind'] == 'tent' else 0.22))
    for pl in D['features']['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.1))
    for cv in D['features']['caves']:
        keep_out.append((cv['x'], cv['z'], 0.3))
    return keep_out


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain(mesa_offset, rings=28)
    carve_path(terrain)
    carve_caves(terrain)
    tessellate_tops(terrain, target=0.11)
    colour_terrain(terrain, desert_cap, desert_lip, desert_cliff)
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    keep_out = landmark_keep_out()
    hoodoos(sink, unlit_sink)
    layout_props(ground, sink, unlit_sink)
    oasis(ground, sink, unlit_sink, keep_out)
    summit_ruins(ground, sink, keep_out)
    keep_out += place_dunes(ground, sink, keep_out)
    place_skull(ground, sink, keep_out)
    path_stones(ground, sink)
    beach_details(ground, sink)
    scatter(ground, sink, unlit_sink, KINDS, keep_out)
    finish(terrain, sink, unlit_sink)


main()
