"""Builds the hand-made desert island (public/models/DesertIsland.glb) in Blender from the exported layout.

  npm run island:export -- desert 48
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
    """A low wind-shaped mound: gentle windward back, steeper lee face, edges sunk into the lawn."""
    M = frame(x, z, y, yaw)
    crest = 0.3
    rings, segs = 6, 20
    grid = []
    for k in range(rings + 1):
        s = k / rings
        ring = []
        for m in range(segs):
            t = 2 * math.pi * m / segs
            u, v = math.cos(t) * s, math.sin(t) * s
            su = (u - crest) / (1 - crest) if u > crest else (u - crest) / (1 + crest)
            e = min(1.0, su * su + v * v)
            b = 1 - e
            hh = height * b * b * (3 - 2 * b) * (1 + 0.12 * noise.noise(Vector((u * 2 + seed, v * 2, 0.5)))) if k < rings else -0.012
            ring.append(sink.bm.verts.new(M @ Vector((u * length / 2, v * width / 2, hh))))
        grid.append(ring)
    apex = sink.bm.verts.new(M @ Vector((crest * 0 * length / 2, 0, height * 0.98)))
    faces = []
    for m in range(segs):
        faces.append(sink.bm.faces.new((apex, grid[1][m], grid[1][(m + 1) % segs])))
    for k in range(1, rings):
        for m in range(segs):
            n = (m + 1) % segs
            faces.append(sink.bm.faces.new((grid[k][m], grid[k + 1][m], grid[k + 1][n], grid[k][n])))
    wind = Matrix.Rotation(yaw, 4, 'Z').to_3x3() @ Vector((1, 0, 0))
    for f in faces:
        f.normal_update()
        lee = f.normal.dot(wind)  # faces looking downwind are the steep, shadowed lee side
        for loop in f.loops:
            c = loop.vert.co
            k = dune_colour(c.x, -c.y, 0.4 - 0.9 * max(0.0, lee))
            if lee > 0.35:
                k = mix(k, col(DESERT['duneDeep']), 0.35)
            loop[sink.layer] = k
    return faces


def place_dunes(ground, sink, keep_out, count=10):
    """Dunes on the lawn, away from the path, the oasis, landmarks and the lawn rim."""
    pool = D['features']['pool']
    made = []
    for _ in range(1500):
        if len(made) >= count:
            break
        x, z = rng.uniform(-2.8, 2.8), rng.uniform(-2.8, 2.8)
        y, nz = ground.at(x, z)
        if y is None or level_of(y) != 'lawn':
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
            if py is None or py < LEVEL_Y[LAWN] - 0.005 or ground.trail_distance(px, pz, LEVEL_Y[LAWN]) < HW + 0.12:
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
    keep_out += place_dunes(ground, sink, keep_out)
    path_stones(ground, sink)
    finish(terrain, sink, unlit_sink)


main()
