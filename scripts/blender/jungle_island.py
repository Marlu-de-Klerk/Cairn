"""Builds the hand-made jungle island (public/models/JungleIsland.glb) in Blender from the exported layout.

Run with Blender's Python (either works):
  blender --background --python scripts/blender/jungle_island.py -- assets-raw/jungle-layout.json assets-raw/JungleIsland.raw.glb
  python scripts/blender/jungle_island.py assets-raw/jungle-layout.json assets-raw/JungleIsland.raw.glb   (with the bpy module)
then `npm run island:pack` compresses it into public/models/. The shared pipeline lives in island_core.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import island_core  # noqa: E402

island_core.init('jungle')
from island_core import *  # noqa: E402,F401,F403

core_palm = island_core.palm


# A few deeper jungle greens on top of the spec palette, so the island reads as dense jungle rather than lawn.
JUNGLE = {
    'deep': '#2F6B55',
    'leaf': '#3E8A5E',
    'leafLight': '#5DAA6A',
    'lime': '#8CCB6E',
    'moss': '#4F8F4A',
    'mossLight': '#7DB85C',
    'bark': '#6E5038',
    'barkDark': '#523A29',
    'banana': '#6DB36A',
    'bananaDark': '#3F8752',
}


def grass(co):
    x, z = co.x, -co.y
    n = noise.noise(Vector((x * 1.3, z * 1.3, 4.2))) * 0.7 + noise.noise(Vector((x * 3.7, z * 3.7, 9.1))) * 0.3
    return mix(col(PAL['cap']), col(PAL['capLight']) if n > 0 else col(JUNGLE['leafLight']), min(1.0, abs(n) * 1.6))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def jungle_cliff(level, h, n1, n2, x, y, z):
    # smooth blends (coloured per corner by colour_terrain), so the wall shades gradually instead of in blocks
    k = mix(col(PAL['cliffShade']), col(PAL['cliffLit']), smooth(0.5 + 1.2 * n1))
    k = mix(k, col(PAL['cliff']), 0.4)
    k = mix(k, col(PAL['cliff'], 0.92 + 0.12 * (0.5 + 0.5 * n2)), 0.3)
    k = mix(k, col(PAL['cliffBase']), smooth((0.16 - h) / 0.08))
    k = mix(k, col(PAL['cliffRim']), smooth((h - 0.86) / 0.04))
    return mix(k, col(JUNGLE['moss']), smooth((h - 0.94) / 0.025))


def jungle_lip(x, y, z, n1, n2):
    return col(PAL['lip'])


PALM = None  # palm colours, set in main() once the palette is loaded


def palm(sink, M, h, r):
    core_palm(sink, M, h, r, PALM)



def canopy_tree(sink, M, h, r):
    bend = Vector((r.uniform(-0.05, 0.05), r.uniform(-0.05, 0.05), 0))
    trunk_h = h * 0.55
    pts = [tuple(bend * (t * t) + Vector((0, 0, trunk_h * t))) for t in [k / 4 for k in range(5)]]
    sink.cyl(M, pts, [0.05, 0.04, 0.034, 0.03, 0.027], 7, [col(JUNGLE['bark'])] * 3 + [col(JUNGLE['barkDark'])])
    for i in range(4):  # buttress roots
        a = 2 * math.pi * i / 4 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        sink.face(M, [d * 0.02, d * 0.11 + Vector((0, 0, -0.01)), d * 0.02 + Vector((0, 0, 0.14))], col(JUNGLE['bark']), double=True)
    top = Vector(pts[-1])
    shade, mid, lit = col(JUNGLE['deep']), col(JUNGLE['leaf']), col(JUNGLE['leafLight'])
    deep = col(JUNGLE['deep'], 0.85)
    if r.random() < 0.1:  # an occasional flowering tree
        bloom = r.choice(('#F29E8E', '#F4B55F', '#E88AA8'))
        shade, mid, lit = col(bloom, 0.72), col(bloom, 0.88), col(bloom)
    k = 3
    for i in range(k):
        a = 2 * math.pi * i / k + r.uniform(-0.3, 0.3)
        rr = h * r.uniform(0.22, 0.27)
        off = Vector((math.cos(a) * h * 0.19, math.sin(a) * h * 0.19, h * r.uniform(0.03, 0.1)))
        sink.blob(M, top + off, rr, lit, mid, shade, subdiv=2, squash=0.8, jitter=0.035, seed=r.uniform(0, 50), smooth=True)
    sink.blob(M, top + Vector((0, 0, h * 0.25)), h * 0.27, lit, mid, deep, subdiv=2, squash=0.82, jitter=0.035, seed=r.uniform(0, 50), smooth=True)


def broadleaf(sink, M, h, r):
    n = r.randint(4, 6)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.3, 0.3)
        stalk_h = h * r.uniform(0.45, 0.75)
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        tip = d * h * 0.18 + Vector((0, 0, stalk_h))
        sink.cyl(M, [(0, 0, 0), tuple(d * h * 0.08 + Vector((0, 0, stalk_h * 0.6))), tuple(tip)], [0.008, 0.007, 0.006], 3, [col(JUNGLE['bananaDark'])])
        frond(sink, M, tip, yaw, h * r.uniform(0.7, 0.95), h * 0.2, r.uniform(0.15, 0.4), r.uniform(0.6, 0.9),
              col(JUNGLE['bananaDark']), col(JUNGLE['banana']), segs=4)


def fern(sink, M, h, r):
    n = r.randint(6, 8)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.25, 0.25)
        frond(sink, M, (0, 0, 0.005), yaw, h * r.uniform(1.4, 1.9), h * 0.28, r.uniform(1.0, 1.5), r.uniform(1.1, 1.5),
              col(FOL['fern']), col(JUNGLE['leafLight']), segs=4)


def bush(sink, M, h, r):
    rr = h * r.uniform(0.6, 0.75)
    sink.blob(M, (0, 0, rr * 0.7), rr, col(JUNGLE['leafLight']), col(FOL['bush']), col(JUNGLE['leaf']), subdiv=2, squash=0.8, jitter=0.04, seed=r.uniform(0, 50), smooth=True)


def grass_tuft(sink, M, h, r):
    for i in range(5):
        a = 2 * math.pi * i / 5 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.012
        tip = d * h * 0.45 + Vector((0, 0, h * r.uniform(0.8, 1.1)))
        sink.face(M, [-s2, s2, tip], col(FOL['grass']) if i % 2 else col(JUNGLE['leafLight']), double=True)


def flower(sink, M, h, r):
    top = Vector((0, 0, h))
    sink.cyl(M, [(0, 0, 0), tuple(top)], [0.005, 0.004], 3, [col(JUNGLE['leaf'])])
    petal = col(FOL['flower']) if r.random() < 0.7 else col('#F7D38A')
    for i in range(5):
        a = 2 * math.pi * i / 5
        d = Vector((math.cos(a), math.sin(a), 0.25))
        s2 = Vector((-math.sin(a), math.cos(a), 0)) * 0.018
        sink.face(M, [top, top + d * 0.03 + s2, top + d * 0.045, top + d * 0.03 - s2], petal, double=True)
    sink.blob(M, top + Vector((0, 0, 0.006)), 0.01, col(FOL['flowerCentre']), col(FOL['flowerCentre']), col(FOL['flowerCentre']), subdiv=0, jitter=0)


def mushroom(sink, M, h, r):
    for i in range(r.randint(1, 3)):
        o = Vector((r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 0))
        hh = h * r.uniform(0.6, 1.0)
        sink.cyl(M, [tuple(o), tuple(o + Vector((0, 0, hh)))], [0.012, 0.009], 5, [col(FOL['mushroomStem'])])
        sink.blob(M, o + Vector((0, 0, hh)), hh * 0.45, col(FOL['mushroom']), col(FOL['mushroom']), col(FOL['mushroomStem']), subdiv=1, squash=0.55, jitter=0.05)


def rock(sink, M, h, r, moss=None):
    moss = M.translation.z > LEVEL_Y[BEACH] + 0.05 if moss is None else moss
    sink.blob(M, (0, 0, h * 0.35), h * 0.7, col(JUNGLE['mossLight']) if moss else col(FOL['heroRock']), col(FOL['heroRock']), col(PAL['cliffShade']),
              subdiv=1, squash=0.6, jitter=0.18, seed=r.uniform(0, 50))


def log(sink, M, h, r):
    L = 0.3
    sink.cyl(M, [(-L / 2, 0, h * 0.5), (L / 2, 0, h * 0.5)], [h * 0.5, h * 0.45], 6, [col(FOL['log'])], cap_top=col(FOL['stumpInner']))
    sink.face(M, [(-L / 2, math.sin(2 * math.pi * k / 6) * h * 0.5, h * 0.5 + math.cos(2 * math.pi * k / 6) * h * 0.5) for k in range(6)], col(FOL['stumpInner']))


def stump(sink, M, h, r):
    sink.cyl(M, [(0, 0, 0), (0, 0, h)], [0.07, 0.06], 7, [col(FOL['stump'])], cap_top=col(FOL['stumpInner']))
    sink.blob(M, (0.03, 0, h), 0.03, col(FOL['stumpMoss']), col(FOL['stumpMoss']), col(FOL['stumpMoss']), subdiv=0, squash=0.5, jitter=0)


def tent(sink, M, r):
    L, W, H = 0.34, 0.2, 0.28
    c, shade = col(FOL['tent']), col(FOL['tent'], 0.86)
    fx, bx = L / 2, -L / 2
    for sgn, k in ((1, c), (-1, shade)):
        mid_y = sgn * W * 0.5
        sink.face(M, [(bx, 0, H), (fx, 0, H), (fx, mid_y, H * 0.5 - 0.012), (bx, mid_y, H * 0.5 - 0.012)], k, double=True)
        sink.face(M, [(bx, mid_y, H * 0.5 - 0.012), (fx, mid_y, H * 0.5 - 0.012), (fx, sgn * W, 0), (bx, sgn * W, 0)], k, double=True)
    sink.face(M, [(bx, W, 0), (bx, -W, 0), (bx, 0, H)], shade, double=True)
    door = col(FOL['tentDoor'])
    sink.face(M, [(fx - 0.03, W * 0.8, 0.002), (fx - 0.03, -W * 0.8, 0.002), (fx - 0.03, 0, H * 0.92)], door, double=True)
    for sgn in (1, -1):  # door flaps tied back
        sink.face(M, [(fx, 0, H), (fx, sgn * W, 0), (fx + 0.07, sgn * W * 0.75, 0.03)], c, double=True)
    for x in (fx + 0.005, bx - 0.005):
        sink.cyl(M, [(x, 0, 0), (x, 0, H + 0.04)], [0.006, 0.006], 4, [col(FOL['log'])])
    sink.face(M, [(bx - 0.03, W + 0.04, 0.003), (fx + 0.1, W + 0.04, 0.003), (fx + 0.1, -W - 0.04, 0.003), (bx - 0.03, -W - 0.04, 0.003)], col('#C9B48A'))


def lily(sink, M, r):
    pts = [(math.cos(a) * 0.05, math.sin(a) * 0.05, 0) for a in [0.4 + 2 * math.pi * k / 9 * 0.95 for k in range(10)]] + [(0, 0, 0)]
    sink.face(M, pts, col(FOL['lily']))
    if r.random() < 0.6:
        flower(sink, M @ Matrix.Translation((0.01, 0, 0)), 0.015, r)


# kind: (builder, count, height range, levels, trail clearance, spacing, edge clearance, tall)
KINDS = [
    ('canopy', canopy_tree, 17, (0.62, 0.86), ('lawn', 'tier', 'summit'), 0.36, 0.34, 0.14, True),
    ('palm', palm, 13, (0.58, 0.78), ('beach', 'lawn', 'tier'), 0.26, 0.26, 0.0, True),
    ('broadleaf', broadleaf, 28, (0.2, 0.3), ('lawn', 'tier', 'summit'), 0.24, 0.17, 0.05, False),
    ('bush', bush, 24, (0.13, 0.2), ('lawn', 'tier', 'summit'), 0.23, 0.14, 0.04, False),
    ('fern', fern, 44, (0.07, 0.1), ('lawn', 'tier', 'summit'), 0.21, 0.1, 0.02, False),
    ('grass', grass_tuft, 44, (0.07, 0.11), ('lawn', 'tier', 'summit'), 0.2, 0.07, 0.0, False),
    ('flower', flower, 18, (0.08, 0.12), ('lawn', 'tier', 'summit'), 0.2, 0.09, 0.02, False),
    ('mushroom', mushroom, 7, (0.06, 0.09), ('lawn', 'tier'), 0.2, 0.2, 0.02, False),
    ('rock', rock, 9, (0.1, 0.18), ('lawn', 'tier', 'beach'), 0.26, 0.3, 0.05, False),
    ('log', log, 2, (0.09, 0.1), ('lawn', 'tier'), 0.3, 0.4, 0.2, False),
    ('stump', stump, 2, (0.1, 0.13), ('lawn', 'tier'), 0.27, 0.4, 0.1, False),
]


def beach_details(ground, sink):
    pts = outline(BEACH, 4)
    ns = outward_normals(pts)
    made = 0
    idx = list(range(len(pts)))
    rng.shuffle(idx)
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
        if made % 3 == 0:
            log(sink, frame(px, pz, gy - 0.03, yaw), 0.07, rng)  # driftwood
        else:
            rock(sink, frame(px, pz, gy - 0.01), rng.uniform(0.06, 0.11), rng, moss=False)
        made += 1


def jungle_keep_out():
    keep_out = []
    for p in D['props']:
        if p['kind'] in ('tent', 'campfire', 'signpost', 'summitCairn'):
            keep_out.append((p['x'], p['z'], 0.32 if p['kind'] == 'tent' else 0.2))
    for pl in D['features']['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.08))
    return keep_out



def layout_props(ground, sink, unlit):
    camp = next((p for p in D['props'] if p['kind'] == 'campfire'), None)
    for p in D['props']:
        y, _ = ground.at(p['x'], p['z'])
        y = p['y'] if y is None else y
        k = p['kind']
        if k == 'tent':
            # door (local +x) toward the default camera, turned a little toward the fire
            toward_fire = math.atan2(-(camp['z'] - p['z']), camp['x'] - p['x']) if camp else -math.pi / 2
            yaw = -math.pi / 2 + 0.35 * math.atan2(math.sin(toward_fire + math.pi / 2), math.cos(toward_fire + math.pi / 2))
            tent(sink, frame(p['x'], p['z'], y, yaw), rng)
        elif k == 'campfire':
            campfire(sink, unlit, frame(p['x'], p['z'], y), rng)
        elif k == 'summitCairn':
            summit_cairn(sink, frame(p['x'], p['z'], y), rng)
        elif k == 'signpost':
            signpost(sink, frame(p['x'], p['z'], y, p['rotY']), rng)
        elif k == 'lily':
            lily(sink, frame(p['x'], p['z'], -0.03, p['rotY']), rng)


def pillars_and_rocks(sink, unlit):
    for pl in D['features']['pillars']:
        pts = [(pl['x'] + pl['r'] * math.cos(pl['rot'] + 2 * math.pi * k / pl['sides']), pl['z'] + pl['r'] * math.sin(pl['rot'] + 2 * math.pi * k / pl['sides'])) for k in range(pl['sides'])]
        rings = 4
        for k in range(rings):
            y0 = pl['baseY'] - 0.05 + (pl['topY'] - pl['baseY'] + 0.05) * k / rings
            y1 = pl['baseY'] - 0.05 + (pl['topY'] - pl['baseY'] + 0.05) * (k + 1) / rings
            shade = col(PAL['pillar'], 0.9 + 0.12 * ((k * 7) % 3) / 2)
            for i in range(len(pts)):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                sink.face(Matrix.Identity(4), [P(a[0], y0, a[1]), P(b[0], y0, b[1]), P(b[0], y1, b[1]), P(a[0], y1, a[1])][::-1], shade)
        top = [P(x, pl['topY'], z) for x, z in pts][::-1]
        sink.face(Matrix.Identity(4), [tuple(v) for v in top][::-1], col(JUNGLE['mossLight']) if pl['grassCap'] else col(PAL['pillarCap']))
        if pl['grassCap']:
            fern(sink, frame(pl['x'], pl['z'], pl['topY']), 0.07, rng)
    for wr in D['features']['waterRocks']:
        sink.blob(frame(wr['x'], wr['z'], -0.05, wr['rot']), (0, 0, wr['height'] * 0.4), wr['r'], col(JUNGLE['mossLight']), col(FOL['heroRock']), col(PAL['cliffShade']), subdiv=1, squash=wr['height'] / wr['r'] * 0.8, jitter=0.15, seed=wr['x'] * 10)
        pts = [(math.cos(2 * math.pi * k / 14), math.sin(2 * math.pi * k / 14)) for k in range(14)]
        for k in range(14):
            a, b = pts[k], pts[(k + 1) % 14]
            M = frame(wr['x'], wr['z'], -0.034)
            r0, r1 = wr['r'] * 0.8, wr['r'] * 1.5
            unlit.face(M, [(a[0] * r0, a[1] * r0, 0), (a[0] * r1, a[1] * r1, 0), (b[0] * r1, b[1] * r1, 0), (b[0] * r0, b[1] * r0, 0)][::-1], col(PAL['foam']))


def waterfalls(ground, sink, unlit):
    fall = D['features']['fall']
    if fall:
        x, _, z = fall['samples'][0]
        cascade(ground, unlit, x, z, fall['dir'][0], fall['dir'][1])
    # A second, front-facing fall from the tier onto the lawn, into a pool, clear of the trail and camp.
    pts = outline(TIER, 2)
    ns = outward_normals(pts)
    best = None
    for i, (x, z) in enumerate(pts):
        facing = ns[i][1]  # toward layout +z (the camera)
        if facing < 0.35:
            continue
        clear = ground.trail_distance(x, z, 0.0)
        camp = min(math.hypot(x - p['x'], z - p['z']) for p in D['props'] if p['kind'] in ('tent', 'campfire'))
        cave = min((math.hypot(x - c['x'], z - c['z']) for c in D['features']['caves']), default=9)
        pillar = min((math.hypot(x - pl['x'], z - pl['z']) for pl in D['features']['pillars']), default=9)
        if clear < 0.55 or camp < 0.5 or cave < 0.45 or pillar < 0.35:
            continue
        score = min(clear, 1.0) + facing + min(pillar, 0.8)
        if best is None or score > best[0]:
            best = (score, i)
    if best is None:
        return
    x, z = pts[best[1]]
    nx, nz = ns[best[1]]
    cascade(ground, unlit, x - nx * 0.35, z - nz * 0.35, nx, nz)
    for a in (-0.9, 0.9):  # rocks either side of where it lands on the lawn
        bx, bz = x + nx * 0.2 + math.cos(a) * nz * 0.18, z + nz * 0.2 - math.cos(a) * nx * 0.18 * (1 if a > 0 else -1)
        yy, _ = ground.at(bx, bz)
        if yy is not None and abs(yy - LEVEL_Y[LAWN]) < 0.01:
            rock(sink, frame(bx, bz, yy), 0.08, rng)


def vines(ground, sink):
    s = D['trail']['samples']
    for level in (TIER, SUMMIT):
        pts = outline(level, 2)
        ns = outward_normals(pts)
        lo, hi = LEVEL_Y[level - 1], LEVEL_Y[level]
        idx = list(range(0, len(pts), 5))
        rng.shuffle(idx)
        made = 0
        for i in idx:
            if made >= (9 if level == TIER else 7):
                break
            x, z = pts[i]
            nx, nz = ns[i]
            if ground.trail_distance(x, z, lo) < 0.3:
                continue
            length = (hi - lo) * rng.uniform(0.35, 0.8)
            chain = []
            for k in range(9):
                y = hi - 0.015 - length * k / 8
                w = ground.wall_point(x, y, z, nx, nz)
                if w is None:
                    break
                chain.append(Vector((w.x + nx * 0.012, y, w.y + nz * 0.012)))
            if len(chain) < 4:
                continue
            made += 1
            M = Matrix.Identity(4)
            for k in range(len(chain) - 1):
                a, b = chain[k], chain[k + 1]
                side = Vector((-nz, 0, nx)) * 0.006
                sink.face(M, [tuple(P(*(a + side))), tuple(P(*(a - side))), tuple(P(*(b - side))), tuple(P(*(b + side)))], col(FOL['vine']), double=True)
                sgn = 1 if k % 2 else -1
                leaf_base = (a + b) / 2
                d = Vector((-nz * sgn, 0.0, nx * sgn)) * 0.035 + Vector((nx, 0, nz)) * 0.012
                tip = leaf_base + d
                w = Vector((0, 0.012, 0))
                sink.face(M, [tuple(P(*leaf_base)), tuple(P(*(leaf_base + d * 0.5 + w))), tuple(P(*tip)), tuple(P(*(leaf_base + d * 0.5 - w)))],
                          col(FOL['vineLeaf']) if k % 3 else col(JUNGLE['leaf']), double=True)


def main():
    global PALM
    PALM = {'trunk': col(FOL['palmTrunk']), 'ring': col(FOL['palmRing']), 'frond': col(FOL['frond']), 'tip': col(FOL['frondTip']),
            'nut': col(JUNGLE['bark']), 'nutDark': col(JUNGLE['barkDark'])}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain(rings=22)
    carve_path(terrain)
    carve_caves(terrain)
    tessellate_tops(terrain)
    colour_terrain(terrain, grass, jungle_lip, jungle_cliff)
    smooth_shade(terrain)
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    layout_props(ground, sink, unlit_sink)
    pillars_and_rocks(sink, unlit_sink)
    waterfalls(ground, sink, unlit_sink)
    vines(ground, sink)
    path_stones(ground, sink)
    beach_details(ground, sink)
    rim_fringe(ground, sink, grass_tuft)
    scatter(ground, sink, unlit_sink, KINDS, jungle_keep_out())
    finish(terrain, sink, unlit_sink, sun_angle=12)


main()
