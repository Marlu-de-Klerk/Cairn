"""Builds the hand-made tundra island (public/models/TundraIsland.glb) in Blender from the exported layout.

  npm run island:export -- tundra
  python scripts/blender/tundra_island.py assets-raw/tundra-layout.json assets-raw/TundraIsland.raw.glb   (bpy module)
  npm run island:pack -- tundra

A snowy peak: blue-grey granite cliffs with snow on every ledge, a snow-capped horn rising behind the summit, snowy
pine forest on the lower tiers, a frozen pond and a log cabin with smoke from the chimney. The shared pipeline lives
in island_core.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import island_core  # noqa: E402

island_core.init('tundra')
from island_core import *  # noqa: E402,F401,F403

SNOW = {
    'snow': '#F3F8FA', 'snowLight': '#FFFFFF', 'snowShade': '#D9E6EE', 'snowBlue': '#C6D8E6',
    'granite': '#8C99A3', 'graniteLit': '#A3AFB8', 'graniteShade': '#75828C', 'graniteDark': '#5C6873', 'joint': '#4A545E',
    'shingle': '#D2CCC0', 'shingleLight': '#E2DDD3', 'tundraGrass': '#9FA878', 'tundraGrassDark': '#7F8A62',
    'pine': '#3F6B5C', 'pineDark': '#2F5448', 'pineLight': '#55806C', 'bark': '#6E5038',
    'log': '#8A6446', 'logDark': '#6A4A34', 'logEnd': '#C9A57C', 'ice': '#CFEAF2', 'iceDeep': '#9FD0E0',
}
PAL.update({'sand': SNOW['shingle'], 'sandWall': '#BDB6A9', 'path': '#C9B8A2', 'pathEdge': '#B5A38C', 'tread': '#7E6450'})
FOL.update({'campfireStone': '#AEB6BC', 'log': SNOW['log'], 'stumpInner': SNOW['logEnd'], 'ember': '#F2A25C'})


# ---------------------------------------------------------------------------------------------------------- terrain

def granite_offset(level, seed):
    """Weathered granite: broad buttresses and gullies, gentle ledges, talus at the foot and a snow cornice at the rim."""
    lo = LEVEL_Y[level - 1]
    hi = LEVEL_Y[level]

    def off(i, f, y):
        if y >= hi - 1e-6:
            return 0.0
        a = 2 * math.pi * i / 128
        h = (y - lo) / (hi - lo)
        buttress = noise.noise(Vector((math.cos(a) * 3.5 + seed, math.sin(a) * 3.5, h * 0.8)))
        d = 0.04 * buttress + 0.008 * noise.noise(Vector((math.cos(a) * 10, math.sin(a) * 10, h * 2 + seed)))
        d += 0.012 * math.sin(h * math.pi * 6 + seed) ** 2  # soft ledges where snow collects
        d += 0.08 * max(0.0, 1 - h * 3.5) ** 2  # talus
        if h > 0.93:
            d = 0.02  # snow cornice hanging over the rim
        return d

    return off


def snow_colour(x, z, shade=0.0):
    n = noise.noise(Vector((x * 1.3, z * 1.3, 2.2))) * 0.7 + noise.noise(Vector((x * 4.2, z * 4.2, 5.9))) * 0.3 + shade
    return mix(col(SNOW['snow']), col(SNOW['snowLight']) if n > 0 else col(SNOW['snowShade']), min(1.0, abs(n) * 1.3))


def pond_ring(x, z):
    pool = D['features']['pool']
    if not pool:
        return 9.0
    return math.hypot(x - pool['x'], z - pool['z']) - pool['r'] * 1.15


def tundra_cap(co):
    x, y, z = co.x, co.z, -co.y
    k = snow_colour(x, z)
    # tundra grass and rock showing through thin snow, mostly on the lawn
    n = noise.noise(Vector((x * 2.0, z * 2.0, 8.8)))
    bare = (n - (0.25 if y < LEVEL_Y[LAWN] + 0.05 else 0.45)) * 3
    if bare > 0:
        m = noise.noise(Vector((x * 7, z * 7, 1.9)))
        k = mix(k, col(SNOW['tundraGrass']) if m > -0.1 else col(SNOW['tundraGrassDark']), min(1.0, bare) * 0.85)
    d = pond_ring(x, z)
    if -0.05 < d < 0.06:
        k = mix(k, col(SNOW['snowBlue']), 0.5)  # blue shade in the drift around the ice
    return k


def tundra_lip(x, y, z, n1, n2):
    return snow_colour(x, z, -0.3)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def granite(x, y, z):
    """Granite tone as a smooth blend of low-frequency noise, so neighbouring faces never jump in shade."""
    n = noise.noise(Vector((x * 1.6, y * 1.2, z * 1.6)))
    k = mix(col(SNOW['graniteShade']), col(SNOW['graniteLit']), smooth(0.5 + 0.8 * n))
    return mix(k, col(SNOW['granite']), 0.35)


def tundra_cliff(level, h, n1, n2, x, y, z):
    k = granite(x, y, z)
    k = mix(k, col(SNOW['graniteDark']), smooth((0.14 - h) / 0.1) * 0.7)  # darker, wetter foot
    streak = noise.noise(Vector((x * 5, y * 0.8, z * 5)))
    snow = max(smooth((h - 0.84) / 0.08), smooth((streak - 0.3) / 0.15) * smooth((h - 0.3) / 0.2))
    return mix(k, snow_colour(x, z, -0.25), snow)


# ---------------------------------------------------------------------------------------------------------- plants and props

def snowy_pine(sink, M, h, r):
    """Stacked cones of dark needles, each with a lip of snow on its upper face."""
    sink.cyl(M, [(0, 0, 0), (0, 0, h * 0.25)], [0.022, 0.018], 5, [col(SNOW['bark'])])
    tiers = 4
    for k in range(tiers):
        z0 = h * (0.15 + 0.2 * k)
        rr = h * (0.34 - 0.065 * k) * r.uniform(0.9, 1.1)
        hh = h * 0.34
        sides = 8
        apex = (0, 0, z0 + hh)
        ring = [(math.cos(2 * math.pi * i / sides + k) * rr, math.sin(2 * math.pi * i / sides + k) * rr, z0 - 0.01 * (i % 2)) for i in range(sides)]
        mid = [(p[0] * 0.55, p[1] * 0.55, z0 + hh * 0.45) for p in ring]
        for i in range(sides):
            j = (i + 1) % sides
            sink.face(M, [ring[i], ring[j], mid[j], mid[i]], col(SNOW['pine']) if i % 2 else col(SNOW['pineDark']))
            sink.face(M, [mid[i], mid[j], apex], snow_colour(0, 0, 0.3) if (i + k) % 3 else col(SNOW['snowShade']))
        sink.face(M, ring[::-1], col(SNOW['pineDark']))


def snow_bush(sink, M, h, r):
    rr = h * r.uniform(0.6, 0.75)
    sink.blob(M, (0, 0, rr * 0.6), rr, col(SNOW['snowLight']), col('#8FAE9A'), col('#5E8070'), subdiv=2, squash=0.75, jitter=0.08, seed=r.uniform(0, 50), smooth=True)


def snow_rock(sink, M, h, r):
    sink.blob(M, (0, 0, h * 0.3), h * 0.7, col(SNOW['snow']), col(SNOW['granite']), col(SNOW['graniteShade']), subdiv=1, squash=0.62, jitter=0.2, seed=r.uniform(0, 50))


def tundra_grass(sink, M, h, r):
    for i in range(5):
        a = 2 * math.pi * i / 5 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.01
        tip = d * h * 0.45 + Vector((0, 0, h * r.uniform(0.8, 1.1)))
        sink.face(M, [-s2, s2, tip], col(SNOW['tundraGrass']) if i % 2 else col('#C2B98A'), double=True)


def snowdrift(sink, M, h, r):
    sink.blob(M, (0, 0, -h * 0.25), h * 2.2, col(SNOW['snowLight']), col(SNOW['snow']), col(SNOW['snowShade']), subdiv=2, squash=0.3, jitter=0.06, seed=r.uniform(0, 50), smooth=True)


def log_cabin(sink, unlit, M, r):
    """Log walls with notched corners, a snow-laden gable roof, a stone chimney with smoke, a glowing window."""
    L, W, H, R = 0.3, 0.22, 0.14, 0.12  # length (x), depth (y), wall height, roof rise; local -y (door) faces the camera
    rad = 0.012
    courses = int(H / (rad * 2))
    for c in range(courses):
        z = rad + c * rad * 2
        tone = col(SNOW['log']) if c % 2 else col(SNOW['logDark'])
        for y in (-W / 2, W / 2):
            sink.cyl(M, [(-L / 2 - 0.02, y, z), (L / 2 + 0.02, y, z)], [rad, rad], 6, [tone], cap_top=col(SNOW['logEnd']))
        for x in (-L / 2, L / 2):
            sink.cyl(M, [(x, -W / 2 - 0.02, z + rad), (x, W / 2 + 0.02, z + rad)], [rad, rad], 6, [tone], cap_top=col(SNOW['logEnd']))
    for x in (-L / 2, L / 2):  # gable ends
        sink.face(M, [(x, -W / 2, H), (x, W / 2, H), (x, 0, H + R)], col(SNOW['log']), double=True)
    over = 0.04
    for sgn in (1, -1):  # roof slabs with a thick snow layer on top
        e = (0, sgn * (W / 2 + over), H - 0.02)
        ridge = (0, 0, H + R)
        q = [(-L / 2 - over, e[1], e[2]), (L / 2 + over, e[1], e[2]), (L / 2 + over, 0, ridge[2]), (-L / 2 - over, 0, ridge[2])]
        sink.face(M, q if sgn < 0 else q[::-1], col(SNOW['logDark']), double=True)
        snow_q = [(p[0], p[1], p[2] + 0.018) for p in q]
        sink.face(M, snow_q if sgn < 0 else snow_q[::-1], snow_colour(0, 0, 0.4 if sgn < 0 else -0.2))
        sink.face(M, [q[0], q[1], snow_q[1], snow_q[0]] if sgn < 0 else [q[1], q[0], snow_q[0], snow_q[1]], col(SNOW['snowShade']))
    sink.face(M, [(-0.03, -W / 2 - rad - 0.001, 0.0), (0.03, -W / 2 - rad - 0.001, 0.0), (0.03, -W / 2 - rad - 0.001, 0.1), (-0.03, -W / 2 - rad - 0.001, 0.1)][::-1], col('#5A3E2C'))  # door
    glow = col('#FFD98A')
    for x in (-0.09, 0.09):  # lit windows
        unlit.face(M, [(x - 0.025, -W / 2 - rad - 0.002, 0.05), (x + 0.025, -W / 2 - rad - 0.002, 0.05), (x + 0.025, -W / 2 - rad - 0.002, 0.095), (x - 0.025, -W / 2 - rad - 0.002, 0.095)][::-1], glow)
    cx = L / 2 - 0.06  # chimney
    box(sink, M, (cx - 0.025, 0.02, 0.0), (cx + 0.025, 0.07, H + R + 0.06), snow_colour(0, 0, 0.5), col('#8E959A'))
    for k in range(4):  # smoke rising and drifting
        s = 0.018 + 0.01 * k
        sink.blob(M, (cx + 0.02 * k, 0.045 + 0.015 * k, H + R + 0.1 + 0.07 * k), s, col('#F4F6F8'), col('#E3E8EC'), col('#CBD3DA'), subdiv=1, squash=0.8, jitter=0.1, seed=k, smooth=True)
    for k in range(3):  # woodpile by the wall
        for j in range(3 - k):
            sink.cyl(M, [(-L / 2 - 0.05 + j * 0.022 + k * 0.011, -W / 2 + 0.02, 0.012 + k * 0.02), (-L / 2 - 0.05 + j * 0.022 + k * 0.011, W / 2 - 0.03, 0.012 + k * 0.02)], [0.011, 0.011], 5, [col(SNOW['log'])], cap_top=col(SNOW['logEnd']))
    # a sled leaning on the far wall
    sink.face(M, [(L / 2 + 0.03, -0.06, 0.0), (L / 2 + 0.03, 0.06, 0.0), (L / 2 + 0.06, 0.06, 0.12), (L / 2 + 0.06, -0.06, 0.12)], col('#C0493E'), double=True)


def peak(sink, M, height, base, r):
    """A jagged granite horn: noisy stacked rings rising to a point, snow above the shoulder and in the gullies."""
    rings, sides = 9, 14
    verts = []
    for k in range(rings):
        t = k / (rings - 1)
        rad = base * (1 - t) ** 0.85
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides
            jag = 1 + 0.3 * noise.noise(Vector((math.cos(a) * 2.5, math.sin(a) * 2.5, t * 3 + 1.3)))
            lean = Vector((0.12 * base * t, 0.08 * base * t, 0))
            ring.append(sink.bm.verts.new(M @ (Vector((math.cos(a) * rad * jag, math.sin(a) * rad * jag, height * t - 0.03)) + lean)))
        verts.append(ring)
    tip = sink.bm.verts.new(M @ Vector((0.14 * base, 0.1 * base, height + 0.04)))
    base_z = (M @ Vector((0, 0, -0.03))).z
    for k in range(rings - 1):
        for i in range(sides):
            j = (i + 1) % sides
            f = sink.bm.faces.new((verts[k][i], verts[k][j], verts[k + 1][j], verts[k + 1][i]))
            f.normal_update()
            for loop in f.loops:
                c = loop.vert.co
                t = (c.z - base_z) / height
                gully = noise.noise(Vector((c.x * 6, c.y * 6, 0.7)))
                rock = granite(c.x, c.z, -c.y)
                snow = max(smooth((t - 0.4) / 0.15), smooth((gully - 0.2) / 0.2) * smooth((t - 0.12) / 0.15))
                loop[sink.layer] = mix(rock, snow_colour(c.x, -c.y, -0.2 if f.normal.x < 0 else 0.2), snow)
    for i in range(sides):
        f = sink.bm.faces.new((verts[-1][i], verts[-1][(i + 1) % sides], tip))
        for loop in f.loops:
            loop[sink.layer] = col(SNOW['snowLight'])


# ---------------------------------------------------------------------------------------------------------- placement

def frozen_pond(ground, sink, unlit, keep_out):
    pool = D['features']['pool']
    if not pool:
        return
    px, pz, pr = pool['x'], pool['z'], pool['r'] * 1.15
    y = LEVEL_Y[LAWN] + 0.004
    n = 40
    edge = []
    for k in range(n):
        a = 2 * math.pi * k / n
        wob = 1 + 0.1 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, 5.1)))
        edge.append((px + math.cos(a) * pr * wob, pz + math.sin(a) * pr * wob))
    centre = [(px, pz)] * n
    rings = [(lerp_outline(edge, centre, 0.999), col(SNOW['iceDeep'])), (lerp_outline(edge, centre, 0.4), col(SNOW['ice'])), (edge, col('#EAF6FA'))]
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
    crack = col('#FFFFFF')
    for k in range(5):  # white cracks across the ice
        a = rng.uniform(0, 2 * math.pi)
        x0, z0 = px + math.cos(a) * pr * 0.1, pz + math.sin(a) * pr * 0.1
        x1, z1 = px + math.cos(a + rng.uniform(-0.3, 0.3)) * pr * 0.85, pz + math.sin(a + rng.uniform(-0.3, 0.3)) * pr * 0.85
        nx, nz = -(z1 - z0), x1 - x0
        ln = math.hypot(nx, nz) or 1
        nx, nz = nx / ln * 0.004, nz / ln * 0.004
        unlit.face(Matrix.Identity(4), [tuple(P(x0 + nx, y + 0.001, z0 + nz)), tuple(P(x0 - nx, y + 0.001, z0 - nz)), tuple(P(x1 - nx, y + 0.001, z1 - nz)), tuple(P(x1 + nx, y + 0.001, z1 + nz))][::-1], crack)
    for k in range(0, n, 2):  # a lip of drifted snow
        x, z = edge[k]
        a = math.atan2(z - pz, x - px)
        sink.blob(frame(x + math.cos(a) * 0.025, z + math.sin(a) * 0.025, y - 0.012), (0, 0, 0), rng.uniform(0.03, 0.045), col(SNOW['snowLight']), col(SNOW['snow']), col(SNOW['snowShade']), subdiv=1, squash=0.45, jitter=0.1, seed=k, smooth=True)
    keep_out.append((px, pz, pr + 0.12))


def summit_peak(ground, sink, keep_out):
    """The snowy horn: it stands on the tier just behind the summit plateau (seen from the default camera) and rises
    well above it, clear of every part of the trail, so the island reads as one mountain."""
    top, tier = LEVEL_Y[SUMMIT], LEVEL_Y[TIER]
    pts = outline(SUMMIT, 2)
    ns = outward_normals(pts)
    cands = []
    for i, (x, z) in enumerate(pts):
        nx, nz = ns[i]
        if nz > -0.25:
            continue  # only the back of the summit
        for push in (0.05, 0.12, 0.2):
            for base in (0.5, 0.42, 0.35, 0.28, 0.22):
                cx, cz = x + nx * push, z + nz * push
                if ground.trail_distance(cx, cz, tier - 0.4) < HW + base + 0.04:
                    continue
                ok = True
                for k in range(10):
                    a = 2 * math.pi * k / 10
                    gy, _ = ground.at(cx + math.cos(a) * base * 0.85, cz + math.sin(a) * base * 0.85)
                    if gy is None or gy < tier - 0.01:
                        ok = False
                        break
                if ok:
                    cands.append((base - 0.3 * cz, cx, cz, base))
                    break
    cands.sort(reverse=True)
    placed = []
    for _, x, z, base in cands:  # the main horn, then a lower shoulder beside it
        if placed and (len(placed) >= 2 or any(math.hypot(x - px, z - pz) < 0.35 + pb * 0.5 for px, pz, pb in placed)):
            continue
        k = len(placed)
        height = (top - tier) + (0.75 if k == 0 else 0.3)
        peak(sink, frame(x, z, tier - 0.02, rng.uniform(0, 6.3)), height, base + 0.05, rng)
        keep_out.append((x, z, base + 0.1))
        placed.append((x, z, base))
        print('peak', round(height, 2), round(base, 2), round(x, 2), round(z, 2))
    if not placed:
        print('peak', None)


def granite_spires(sink):
    I = Matrix.Identity(4)
    for pl in D['features']['pillars']:
        sides, rings = pl['sides'], 5
        y0, y1 = pl['baseY'] - 0.05, pl['topY']
        radii = [pl['r'] * (1.1 - 0.35 * k / rings + 0.05 * math.sin(k * 2.7 + pl['rot'])) for k in range(rings + 1)]
        for k in range(rings):
            ya, yb = y0 + (y1 - y0) * k / rings, y0 + (y1 - y0) * (k + 1) / rings
            for i in range(sides):
                ta, tb = pl['rot'] + 2 * math.pi * i / sides, pl['rot'] + 2 * math.pi * (i + 1) / sides
                q = [(ta, ya, radii[k]), (tb, ya, radii[k]), (tb, yb, radii[k + 1]), (ta, yb, radii[k + 1])]
                c = granite(pl['x'] + math.cos(ta) * 0.1, (ya + yb) / 2, pl['z'] + math.sin(ta) * 0.1)
                sink.face(I, [tuple(P(pl['x'] + r * math.cos(t), yy, pl['z'] + r * math.sin(t))) for t, yy, r in q][::-1], c)
        cap = [P(pl['x'] + radii[-1] * math.cos(pl['rot'] + 2 * math.pi * i / sides), y1, pl['z'] + radii[-1] * math.sin(pl['rot'] + 2 * math.pi * i / sides)) for i in range(sides)]
        sink.face(I, [tuple(v) for v in cap], col(SNOW['granite']))
        sink.blob(frame(pl['x'], pl['z'], y1 - 0.01), (0, 0, 0), radii[-1] * 1.1, col(SNOW['snowLight']), col(SNOW['snow']), col(SNOW['snowShade']), subdiv=1, squash=0.45, jitter=0.1, seed=pl['x'])


def ice_shore(sink, unlit):
    """Snow-capped sea rocks, and ice floes drifting in the shallows."""
    for wr in D['features']['waterRocks']:
        snow_rock(sink, frame(wr['x'], wr['z'], -0.05, wr['rot']), wr['r'] * 1.2, rng)
        pts = [(math.cos(2 * math.pi * k / 14), math.sin(2 * math.pi * k / 14)) for k in range(14)]
        M = frame(wr['x'], wr['z'], -0.034)
        r0, r1 = wr['r'] * 0.8, wr['r'] * 1.4
        for k in range(14):
            a, b = pts[k], pts[(k + 1) % 14]
            unlit.face(M, [(a[0] * r0, a[1] * r0, 0), (a[0] * r1, a[1] * r1, 0), (b[0] * r1, b[1] * r1, 0), (b[0] * r0, b[1] * r0, 0)][::-1], col(PAL['foam']))
    beach = outline(BEACH, 4)
    ns = outward_normals(beach)
    idx = list(range(len(beach)))
    rng.shuffle(idx)
    start = D['trail']['samples'][0]
    made = 0
    for i in idx:
        if made >= 9:
            break
        x, z = beach[i]
        nx, nz = ns[i]
        d = rng.uniform(0.18, 0.5)
        fx, fz = x + nx * d, z + nz * d
        if math.hypot(fx - start[0], fz - start[2]) < 0.6:
            continue
        size = rng.uniform(0.06, 0.13)
        M = frame(fx, fz, -0.045, rng.uniform(0, 6.3))
        sides = rng.randint(5, 7)
        pts = [(math.cos(2 * math.pi * k / sides) * size * rng.uniform(0.7, 1.2), math.sin(2 * math.pi * k / sides) * size * rng.uniform(0.7, 1.2)) for k in range(sides)]
        for k in range(sides):  # floe edges
            a, b = pts[k], pts[(k + 1) % sides]
            sink.face(M, [(a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], 0.03), (a[0], a[1], 0.03)], col('#D8EEF4'))
        sink.face(M, [(p[0], p[1], 0.03) for p in pts], col('#F7FBFD'))
        made += 1


def layout_props(ground, sink, unlit):
    camp = next((p for p in D['props'] if p['kind'] == 'campfire'), None)
    for p in D['props']:
        y, _ = ground.at(p['x'], p['z'])
        y = p['y'] if y is None else y
        k = p['kind']
        if k == 'tent':
            toward_fire = math.atan2(-(camp['z'] - p['z']), camp['x'] - p['x']) if camp else -math.pi / 2
            yaw = 0.3 * math.atan2(math.sin(toward_fire + math.pi / 2), math.cos(toward_fire + math.pi / 2))
            log_cabin(sink, unlit, frame(p['x'], p['z'], y, yaw), rng)
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
            keep_out.append((p['x'], p['z'], 0.38 if p['kind'] == 'tent' else 0.22))
    for pl in D['features']['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.1))
    return keep_out


# kind: (builder, count, height range, levels, trail clearance, spacing, edge clearance, tall)
KINDS = [
    ('pine', snowy_pine, 26, (0.42, 0.66), ('lawn', 'tier', 'summit'), 0.26, 0.24, 0.08, True),
    ('smallPine', snowy_pine, 18, (0.2, 0.3), ('lawn', 'tier', 'summit', 'beach'), 0.2, 0.16, 0.05, False),
    ('bush', snow_bush, 14, (0.1, 0.15), ('lawn', 'tier', 'summit'), 0.18, 0.14, 0.04, False),
    ('drift', snowdrift, 10, (0.05, 0.08), ('lawn', 'tier'), 0.22, 0.22, 0.12, False),
    ('rock', snow_rock, 12, (0.08, 0.15), ('lawn', 'tier', 'summit', 'beach'), 0.2, 0.2, 0.05, False),
    ('grass', tundra_grass, 30, (0.05, 0.08), ('beach', 'lawn', 'tier'), 0.14, 0.08, 0.0, False),
]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain(granite_offset, rings=16)
    carve_path(terrain)
    carve_caves(terrain)
    tessellate_tops(terrain, target=0.14)
    colour_terrain(terrain, tundra_cap, tundra_lip, tundra_cliff)
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    keep_out = landmark_keep_out()
    layout_props(ground, sink, unlit_sink)
    granite_spires(sink)
    frozen_pond(ground, sink, unlit_sink, keep_out)
    summit_peak(ground, sink, keep_out)
    ice_shore(sink, unlit_sink)
    path_stones(ground, sink)
    rim_fringe(ground, sink, tundra_grass)
    scatter(ground, sink, unlit_sink, KINDS, keep_out)
    finish(terrain, sink, unlit_sink)


main()
