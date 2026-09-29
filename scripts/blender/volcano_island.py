"""Builds the hand-made volcano island (public/models/VolcanoIsland.glb) in Blender from the exported layout.

  npm run island:export -- volcano
  python scripts/blender/volcano_island.py assets-raw/volcano-layout.json assets-raw/VolcanoIsland.raw.glb   (bpy)
  npm run island:pack -- volcano

An active cone: black basalt cliffs flaring into cinder slopes, glowing lava cracks, a smoking crater cone behind the
summit with a lava fall pouring from it, a front lava fall into a glowing pool, steam vents, charred ash trees,
obsidian rocks, basalt columns and a black-sand beach. The shared pipeline lives in island_core.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import island_core  # noqa: E402

island_core.init('volcano')
from island_core import *  # noqa: E402,F401,F403

VO = {
    'basalt': '#4A4442', 'basaltLit': '#5E5653', 'basaltShade': '#3A3534', 'basaltDark': '#2C2828', 'rust': '#7A4A3A',
    'ash': '#8C827C', 'ashLight': '#A09690', 'ashDark': '#6E6560', 'scoria': '#5A3E36', 'sulphur': '#D9C45A',
    'sand': '#4E4B4E', 'sandLight': '#65616A', 'lava': '#F2A25C', 'lavaHot': '#FFD27A', 'lavaDeep': '#D9582E',
    'smoke': '#9A9594', 'smokeLight': '#C2BEBC', 'steam': '#F2F2F0', 'charred': '#3A322E', 'obsidian': '#26232A',
}
PAL.update({'sand': VO['sand'], 'sandWall': '#3E3B3E', 'path': '#B9A68E', 'pathEdge': '#9E8B74', 'tread': '#5C4A42',
            'fall': VO['lava'], 'fallStreak': VO['lavaHot']})
FOL.update({'campfireStone': '#6E6763', 'log': '#6A4A34', 'stumpInner': '#B08A64', 'ember': '#F2A25C'})


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------------------------------- terrain

def cone_offset(level, seed):
    """Basalt walls that flare out at the foot into cinder slopes, so the island reads as one broad cone."""
    lo = LEVEL_Y[level - 1]
    hi = LEVEL_Y[level]

    def off(i, f, y):
        if y >= hi - 1e-6:
            return 0.0
        a = 2 * math.pi * i / 128
        h = (y - lo) / (hi - lo)
        ribs = noise.noise(Vector((math.cos(a) * 6 + seed, math.sin(a) * 6, h * 0.6)))  # lava-flow ribs down the slope
        d = 0.03 * ribs + 0.008 * noise.noise(Vector((math.cos(a) * 14, math.sin(a) * 14, h * 3 + seed)))
        d += 0.24 * max(0.0, 1 - h * 1.6) ** 2  # the cinder skirt
        if h > 0.94:
            d = 0.01
        return d

    return off


def basalt(x, y, z):
    n = noise.noise(Vector((x * 1.7, y * 1.3, z * 1.7)))
    k = mix(col(VO['basaltShade']), col(VO['basaltLit']), smooth(0.5 + 0.8 * n))
    rust = noise.noise(Vector((x * 3, y * 2, z * 3 + 5)))
    return mix(k, col(VO['rust']), smooth((rust - 0.3) / 0.2) * 0.5)


def ash_ground(x, z, top=False):
    n = noise.noise(Vector((x * 1.3, z * 1.3, 3.1))) * 0.7 + noise.noise(Vector((x * 4.5, z * 4.5, 7.3))) * 0.3
    k = mix(col(VO['ash']), col(VO['ashLight']) if n > 0 else col(VO['ashDark']), min(1.0, abs(n) * 1.4))
    scoria = noise.noise(Vector((x * 2.2, z * 2.2, 17.1)))
    return mix(k, col(VO['scoria']), smooth((scoria - 0.2) / 0.15) * 0.8)


def vo_cap(co):
    x, y, z = co.x, co.z, -co.y
    return ash_ground(x, z, top=y > LEVEL_Y[LAWN] + 0.05)


def vo_lip(x, y, z, n1, n2):
    return col(VO['sandLight'], 0.95 + 0.05 * n2)


def vo_cliff(level, h, n1, n2, x, y, z):
    k = basalt(x, y, z)
    k = mix(k, ash_ground(x, z), smooth((0.45 - h) / 0.3) * 0.7)  # cinders drifting over the lower slope
    return mix(k, col(VO['ashDark']), smooth((h - 0.88) / 0.06) * 0.6)


def smooth_shade(ob, angle=40):
    for poly in ob.data.polygons:
        poly.use_smooth = True
    ob.data.set_sharp_from_angle(angle=math.radians(angle))


# ---------------------------------------------------------------------------------------------------------- props

def ash_tree(sink, M, h, r):
    """A charred, leafless tree: a crooked trunk and a few bare forking branches."""
    lean = Vector((r.uniform(-0.04, 0.04), r.uniform(-0.04, 0.04), 0))
    pts = [tuple(lean * t * t + Vector((0, 0, h * 0.62 * t))) for t in (0, 0.5, 1.0)]
    sink.cyl(M, pts, [0.018, 0.013, 0.009], 5, [col(VO['charred'])])
    top = Vector(pts[-1])
    for k in range(r.randint(3, 4)):
        a = 2 * math.pi * k / 4 + r.uniform(-0.4, 0.4)
        d = Vector((math.cos(a), math.sin(a), 0))
        mid = top + d * h * 0.14 + Vector((0, 0, h * 0.1))
        tip = mid + d * h * 0.12 + Vector((0, 0, h * r.uniform(0.12, 0.22)))
        sink.cyl(M, [tuple(top - Vector((0, 0, h * 0.08))), tuple(mid), tuple(tip)], [0.007, 0.005, 0.002], 4, [col(VO['charred'])])
        side = Vector((-d.y, d.x, 0))
        sink.cyl(M, [tuple(mid), tuple(mid + side * h * 0.1 + Vector((0, 0, h * 0.12)))], [0.004, 0.0015], 3, [col(VO['charred'])])


def obsidian(sink, M, h, r):
    sink.blob(M, (0, 0, h * 0.35), h * 0.7, col('#4A4652'), col(VO['obsidian']), col('#18161C'), subdiv=1, squash=0.7, jitter=0.28, seed=r.uniform(0, 50))


def lava_rock(sink, M, h, r):
    sink.blob(M, (0, 0, h * 0.3), h * 0.7, col(VO['basaltLit']), col(VO['basalt']), col(VO['basaltDark']), subdiv=1, squash=0.6, jitter=0.25, seed=r.uniform(0, 50))


def dry_tuft(sink, M, h, r):
    for i in range(5):
        a = 2 * math.pi * i / 5 + r.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        s2 = Vector((-d.y, d.x, 0)) * 0.01
        tip = d * h * 0.45 + Vector((0, 0, h * r.uniform(0.8, 1.1)))
        sink.face(M, [-s2, s2, tip], col('#8C8A5A') if i % 2 else col('#6E7A4E'), double=True)


def hardy_fern(sink, M, h, r):
    n = r.randint(5, 7)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.25, 0.25)
        frond(sink, M, (0, 0, 0.005), yaw, h * r.uniform(1.3, 1.7), h * 0.28, r.uniform(1.0, 1.3), r.uniform(1.1, 1.3), col('#4E6E4A'), col('#7F9A5E'), segs=4)


def steam_vent(sink, unlit, M, r):
    """A fumarole: a yellow sulphur crust, a glowing slot and a small column of steam."""
    sink.blob(M, (0, 0, -0.004), 0.04, col(VO['sulphur']), col('#B8A548'), col('#8E7E38'), subdiv=1, squash=0.25, jitter=0.2, seed=r.uniform(0, 9))
    unlit.face(M, [(-0.012, -0.004, 0.006), (0.012, -0.004, 0.006), (0.012, 0.004, 0.006), (-0.012, 0.004, 0.006)], col(VO['lavaHot']))
    for k in range(3):
        s = 0.018 + 0.01 * k
        sink.blob(M, (0.006 * k, 0.004 * k, 0.03 + 0.045 * k), s, col(VO['steam']), col('#E3E3E0'), col('#C9C9C6'), subdiv=1, squash=0.85, jitter=0.12, seed=k + r.uniform(0, 9), smooth=True)


def expedition_tent(sink, M, r):
    """A khaki ridge tent with an orange fly, door toward the camera (local -y), and a couple of crates."""
    L, W, H = 0.28, 0.2, 0.18
    c, shade = col('#C9B07A'), col('#A89260')
    for sgn, k in ((1, shade), (-1, c)):
        sink.face(M, [(-L / 2, 0, H), (L / 2, 0, H), (L / 2, sgn * W / 2, 0), (-L / 2, sgn * W / 2, 0)][::sgn], k, double=True)
    sink.face(M, [(L / 2, -W / 2, 0), (L / 2, W / 2, 0), (L / 2, 0, H)], shade, double=True)
    sink.face(M, [(-L / 2, -W / 2, 0), (-L / 2, 0, H), (-L / 2, W / 2, 0)], c, double=True)
    sink.face(M, [(-L / 2 - 0.02, 0, H + 0.01), (L / 2 + 0.02, 0, H + 0.01), (L / 2 + 0.02, -W * 0.3, H * 0.6), (-L / 2 - 0.02, -W * 0.3, H * 0.6)], col('#E0703A'), double=True)  # fly
    sink.face(M, [(-0.04, -W / 2 * 0.55 - 0.001, 0.0), (0.04, -W / 2 * 0.55 - 0.001, 0.0), (0.0, -W * 0.14, H * 0.7)][::-1], col('#3A2E26'))  # door
    for k, (x, y) in enumerate(((L / 2 + 0.06, -0.06), (L / 2 + 0.07, 0.02))):
        s = 0.03 - 0.005 * k
        box(sink, M @ Matrix.Translation((x, y, 0)) @ Matrix.Rotation(0.3 * k, 4, 'Z'), (-s, -s, 0), (s, s, s * 1.4), col('#B98A62'), col('#8C6446'))


def basalt_columns(sink):
    """The layout's pillars as clusters of hexagonal basalt columns at stepped heights."""
    for pl in D['features']['pillars']:
        rr = pl['r'] * 0.42
        spots = [(0, 0)] + [(math.cos(pl['rot'] + math.pi / 3 * k) * rr * 1.75, math.sin(pl['rot'] + math.pi / 3 * k) * rr * 1.75) for k in range(6)]
        for k, (dx, dz) in enumerate(spots):
            top = pl['topY'] - (0 if k == 0 else (pl['topY'] - pl['baseY']) * rng.uniform(0.1, 0.55))
            M = frame(pl['x'] + dx, pl['z'] + dz, pl['baseY'] - 0.05, pl['rot'])
            hgt = top - pl['baseY'] + 0.05
            sink.cyl(M, [(0, 0, 0), (0, 0, hgt)], [rr, rr], 6, [col(VO['basalt']) if k % 2 else col(VO['basaltLit'])], cap_top=col(VO['basaltShade']))


def sea_rocks(sink, unlit):
    for wr in D['features']['waterRocks']:
        lava_rock(sink, frame(wr['x'], wr['z'], -0.05, wr['rot']), wr['r'] * 1.2, rng)
        pts = [(math.cos(2 * math.pi * k / 14), math.sin(2 * math.pi * k / 14)) for k in range(14)]
        M = frame(wr['x'], wr['z'], -0.034)
        r0, r1 = wr['r'] * 0.8, wr['r'] * 1.4
        for k in range(14):
            a, b = pts[k], pts[(k + 1) % 14]
            unlit.face(M, [(a[0] * r0, a[1] * r0, 0), (a[0] * r1, a[1] * r1, 0), (b[0] * r1, b[1] * r1, 0), (b[0] * r0, b[1] * r0, 0)][::-1], col(PAL['foam']))


# ---------------------------------------------------------------------------------------------------------- the cone and lava

def smoke_plume(sink, M, r):
    for k in range(6):
        s = 0.05 + 0.022 * k
        c = mix(col(VO['smoke']), col(VO['smokeLight']), k / 6)
        sink.blob(M, (0.012 * k * k, 0.02 * k, 0.08 + 0.09 * k), s, mix(c, col('#FFFFFF'), 0.2), c, mix(c, col('#000000'), 0.2), subdiv=2, squash=0.8, jitter=0.12, seed=k * 3.1, smooth=True)


def crater_cone(sink, unlit, M, base_r, height, crater_r):
    """A broad truncated cone with a jagged rim and a glowing lava lake in its crater (local frame, base at 0)."""
    rings, sides = 16, 28
    bm = sink.soft
    layer = bm.loops.layers.float_color['Col']
    verts = []
    for k in range(rings + 1):
        t = k / rings
        rad = crater_r * 1.15 + (base_r - crater_r * 1.15) * (1 - t) ** 3  # concave flanks, flaring at the foot
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides
            jag = 1 + 0.08 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, t * 2.5)))
            zz = height * t + (0.03 * noise.noise(Vector((math.cos(a) * 4, math.sin(a) * 4, 9.9))) if k == rings else 0)
            ring.append(bm.verts.new(M @ Vector((math.cos(a) * rad * jag, math.sin(a) * rad * jag, zz - 0.02))))
        verts.append(ring)
    inner = [bm.verts.new(M @ Vector((math.cos(2 * math.pi * i / sides) * crater_r * 0.85, math.sin(2 * math.pi * i / sides) * crater_r * 0.85, height - 0.08))) for i in range(sides)]
    rows = verts + [inner]
    base_z = (M @ Vector((0, 0, -0.02))).z
    for k in range(len(rows) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            f = bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
            f.normal_update()
            if k == len(rows) - 2 and f.normal.z < 0:
                f.normal_flip()
            f.smooth = True
            for loop in f.loops:
                c = loop.vert.co
                t = (c.z - base_z) / height
                gully = noise.noise(Vector((c.x * 5, c.y * 5, 0.3)))
                rock = mix(basalt(c.x, c.z, -c.y), col(VO['ashDark']), smooth((0.5 - t) / 0.4) * 0.6)
                rock = mix(rock, col(VO['rust']), smooth((gully - 0.3) / 0.2) * 0.5)
                rock = mix(rock, col(VO['ashLight']), 0.35)  # the soft material shades darker than the toon walls
                if k >= rings:
                    rock = mix(col(VO['lavaDeep']), col(VO['basaltDark']), 0.5)  # glowing inner wall
                loop[layer] = rock
    # the lava lake, unlit so it glows
    centre = M @ Vector((0, 0, height - 0.075))
    rings_l = [[M @ Vector((math.cos(2 * math.pi * i / sides) * crater_r * s, math.sin(2 * math.pi * i / sides) * crater_r * s, height - 0.075)) for i in range(sides)] for s in (0.86, 0.5)]
    for i in range(sides):
        j = (i + 1) % sides
        unlit.face(Matrix.Identity(4), [tuple(rings_l[0][i]), tuple(rings_l[0][j]), tuple(rings_l[1][j]), tuple(rings_l[1][i])], col(VO['lava']), double=True)
        unlit.face(Matrix.Identity(4), [tuple(rings_l[1][i]), tuple(rings_l[1][j]), tuple(centre)], col(VO['lavaHot']), double=True)


def summit_cone(ground, sink, unlit, keep_out):
    """The crater cone behind the summit. Its foot stands on the lawn, so its flanks run down into the mountain
    instead of overhanging a ledge; it may bury terrain but never the trail, and never reaches past the island."""
    top, tier, lawn = LEVEL_Y[SUMMIT], LEVEL_Y[TIER], LEVEL_Y[LAWN]
    foot = lawn - 0.03
    height = (top - foot) + 0.45
    s_all = D['trail']['samples']
    pts = outline(SUMMIT, 2)
    ns = outward_normals(pts)

    def surface(d, base, crater_r):
        """Cone surface height at distance d from its axis (None outside the foot)."""
        if d >= base:
            return None
        if d <= crater_r * 1.15:
            return foot + height
        t = 1 - ((d - crater_r * 1.15) / (base - crater_r * 1.15)) ** (1 / 3)
        return foot + height * t

    cands = []
    for i, (x, z) in enumerate(pts):
        nx, nz = ns[i]
        if nz > -0.2:
            continue
        for push in (0.0, 0.1, 0.2, 0.3):
            cx, cz = x + nx * push, z + nz * push
            for base in (1.1, 1.0, 0.9, 0.8, 0.7, 0.6):
                crater_r = 0.18
                ok = True
                for k in range(16):  # the foot must land on the island, not over the sea
                    a = 2 * math.pi * k / 16
                    gy, _ = ground.at(cx + math.cos(a) * base * 0.92, cz + math.sin(a) * base * 0.92)
                    if gy is None or gy < lawn - 0.01:
                        ok = False
                        break
                if ok:
                    for q in s_all:  # the trail must stay above the cone's flanks
                        d = math.hypot(q[0] - cx, q[2] - cz) - HW - 0.04
                        h = surface(max(0.0, d), base, crater_r)
                        if h is not None and h > q[1] - 0.03:
                            ok = False
                            break
                if ok:
                    cands.append((base - 0.2 * cz, cx, cz, base))
                    break
    if not cands:
        print('cone', None)
        return None
    _, x, z, base = max(cands)
    crater_r = 0.18
    M = frame(x, z, foot + 0.02, rng.uniform(0, 6.3))
    crater_cone(sink, unlit, M, base, height, crater_r)
    smoke_plume(sink, frame(x, z, foot + height - 0.05, 0.4), rng)
    keep_out.append((x, z, base * 0.7))
    print('cone', round(base, 2), round(height, 2), round(x, 2), round(z, 2))
    return (x, z, foot + height, crater_r)


def lava_cracks(ground, unlit):
    """Glowing fissures zigzagging down the basalt walls, away from the trail."""
    for level in (TIER, SUMMIT):
        pts = outline(level, 2)
        ns = outward_normals(pts)
        lo, hi = LEVEL_Y[level - 1], LEVEL_Y[level]
        idx = list(range(0, len(pts), 3))
        rng.shuffle(idx)
        made = 0
        for i in idx:
            if made >= 6:
                break
            x, z = pts[i]
            nx, nz = ns[i]
            if ground.trail_distance(x, z, lo) < 0.35:
                continue
            chain = []
            wob = rng.uniform(0, 9)
            for k in range(8):
                y = hi - 0.06 - (hi - lo) * 0.6 * k / 7
                side = 0.03 * math.sin(k * 1.7 + wob)
                w = ground.wall_point(x - nz * side, y, z + nx * side, nx, nz)
                if w is None:
                    break
                chain.append(Vector((w.x + nx * 0.006, y, w.y + nz * 0.006)))
            if len(chain) < 4:
                continue
            made += 1
            for k in range(len(chain) - 1):
                a, b = chain[k], chain[k + 1]
                wdt = 0.007 * (1 - k / len(chain)) + 0.002
                sd = Vector((-nz, 0, nx)) * wdt
                unlit.face(Matrix.Identity(4), [tuple(P(*(a + sd))), tuple(P(*(a - sd))), tuple(P(*(b - sd))), tuple(P(*(b + sd)))], col(VO['lavaHot']) if k % 2 else col(VO['lava']), double=True)


def lava_pool(unlit, sink, x, z, y, r):
    n = 24
    edge = [(x + math.cos(2 * math.pi * k / n) * r * (1 + 0.12 * noise.noise(Vector((math.cos(2 * math.pi * k / n) * 2, math.sin(2 * math.pi * k / n) * 2, 1.1)))),
             z + math.sin(2 * math.pi * k / n) * r * (1 + 0.12 * noise.noise(Vector((math.cos(2 * math.pi * k / n) * 2, math.sin(2 * math.pi * k / n) * 2, 1.1))))) for k in range(n)]
    centre = [(x, z)] * n
    rings = [(lerp_outline(edge, centre, 0.999), col(VO['lavaHot'])), (lerp_outline(edge, centre, 0.4), col(VO['lava'])), (edge, col(VO['lavaDeep']))]
    verts = [[unlit.bm.verts.new(P(px, y, pz)) for px, pz in pts] for pts, _ in rings]
    for rr in range(len(verts) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = unlit.bm.faces.new((verts[rr][i], verts[rr + 1][i], verts[rr + 1][j], verts[rr][j]))
            for loop in f.loops:
                loop[unlit.layer] = rings[rr][1] if loop.vert in (verts[rr][i], verts[rr][j]) else rings[rr + 1][1]
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
    for k in range(0, n, 2):  # a crust of cooled black rock around it
        px, pz = edge[k]
        a = math.atan2(pz - z, px - x)
        sink.blob(frame(px + math.cos(a) * 0.02, pz + math.sin(a) * 0.02, y - 0.008), (0, 0, 0), rng.uniform(0.02, 0.032), col(VO['basaltLit']), col(VO['basalt']), col(VO['basaltDark']), subdiv=0, squash=0.5, jitter=0.2, seed=k)
    for k in range(3):  # steam
        a = rng.uniform(0, 2 * math.pi)
        sink.blob(frame(x + math.cos(a) * r * 0.5, z + math.sin(a) * r * 0.5, y + 0.05 + 0.04 * k), (0, 0, 0), 0.03 + 0.012 * k, col(VO['steam']), col('#E3E3E0'), col('#C9C9C6'), subdiv=1, squash=0.8, jitter=0.1, seed=k, smooth=True)


def lava_falls(ground, sink, unlit, cone, keep_out):
    """The layout's lava fall (down the back, from the cone's lip) and a second fall toward the camera from the tier
    onto the lawn, into a glowing pool."""
    fall = D['features']['fall']
    if fall:
        x, _, z = fall['samples'][0]
        cascade(ground, unlit, x, z, fall['dir'][0], fall['dir'][1])
        if cone:  # a tongue of lava from the crater lip down the cone to where the fall starts
            cx, cz, cy, cr = cone
            dx, dz = x - cx, z - cz
            ln = math.hypot(dx, dz) or 1
            dx, dz = dx / ln, dz / ln
            for k in range(10):
                t0, t1 = k / 10, (k + 1) / 10
                ax, az = cx + dx * (cr + (ln - cr) * t0), cz + dz * (cr + (ln - cr) * t0)
                bx, bz = cx + dx * (cr + (ln - cr) * t1), cz + dz * (cr + (ln - cr) * t1)
                ay = cy - 0.02 - (cy - LEVEL_Y[SUMMIT]) * t0 ** 0.8 * 1.02
                by = cy - 0.02 - (cy - LEVEL_Y[SUMMIT]) * t1 ** 0.8 * 1.02
                w = 0.035
                q = [P(ax - dz * w, ay + 0.012, az + dx * w), P(ax + dz * w, ay + 0.012, az - dx * w), P(bx + dz * w, by + 0.012, bz - dx * w), P(bx - dz * w, by + 0.012, bz + dx * w)]
                unlit.face(Matrix.Identity(4), [tuple(v) for v in q], col(VO['lavaHot']) if k % 3 == 0 else col(VO['lava']), double=True)
    pts = outline(TIER, 2)
    ns = outward_normals(pts)
    camp = [(p['x'], p['z']) for p in D['props'] if p['kind'] in ('tent', 'campfire')]
    best = None
    for i, (x, z) in enumerate(pts):
        facing = ns[i][1]
        if facing < 0.3:
            continue
        clear = ground.trail_distance(x, z, 0.0)
        near_camp = min(math.hypot(x - cx, z - cz) for cx, cz in camp)
        pillar = min((math.hypot(x - pl['x'], z - pl['z']) for pl in D['features']['pillars']), default=9)
        if clear < 0.55 or near_camp < 0.5 or pillar < 0.35:
            continue
        score = min(clear, 1.0) + facing + min(pillar, 0.8)
        if best is None or score > best[0]:
            best = (score, i)
    if best is None:
        print('front fall', None)
        return
    x, z = pts[best[1]]
    nx, nz = ns[best[1]]
    # walk out over the cinder skirt to the lawn and make the pool there
    px, pz = x, z
    for _ in range(80):
        gy, _ = ground.at(px, pz)
        if gy is not None and gy <= LEVEL_Y[LAWN] + 0.005:
            break
        px, pz = px + nx * 0.02, pz + nz * 0.02
    cascade(ground, unlit, x - nx * 0.3, z - nz * 0.3, nx, nz)
    lava_pool(unlit, sink, px + nx * 0.12, pz + nz * 0.12, LEVEL_Y[LAWN] + 0.004, 0.13)
    keep_out.append((px + nx * 0.12, pz + nz * 0.12, 0.25))
    print('front fall', round(x, 2), round(z, 2))


def layout_props(ground, sink, unlit):
    camp = next((p for p in D['props'] if p['kind'] == 'campfire'), None)
    for p in D['props']:
        y, _ = ground.at(p['x'], p['z'])
        y = p['y'] if y is None else y
        k = p['kind']
        if k == 'tent':
            toward_fire = math.atan2(-(camp['z'] - p['z']), camp['x'] - p['x']) if camp else -math.pi / 2
            yaw = 0.3 * math.atan2(math.sin(toward_fire + math.pi / 2), math.cos(toward_fire + math.pi / 2))
            expedition_tent(sink, frame(p['x'], p['z'], y, yaw), rng)
        elif k == 'campfire':
            campfire(sink, unlit, frame(p['x'], p['z'], y), rng)
        elif k == 'summitCairn':
            summit_cairn(sink, frame(p['x'], p['z'], y), rng)
        elif k == 'signpost':
            signpost(sink, frame(p['x'], p['z'], y, p['rotY']), rng)


def vents(ground, sink, unlit, keep_out):
    made = 0
    for _ in range(600):
        if made >= 6:
            break
        x, z = rng.uniform(-2.8, 2.8), rng.uniform(-2.8, 2.8)
        gy, _ = ground.at(x, z)
        if gy is None or level_of(gy) not in ('lawn', 'tier', 'summit') or ground.trail_distance(x, z, gy) < HW + 0.12 or not ground.flat(x, z, gy, 0.05):
            continue
        if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out):
            continue
        steam_vent(sink, unlit, frame(x, z, gy - 0.002, rng.uniform(0, 6.3)), rng)
        keep_out.append((x, z, 0.12))
        made += 1
    print('vents', made)


def landmark_keep_out():
    keep_out = []
    for p in D['props']:
        if p['kind'] in ('tent', 'campfire', 'signpost', 'summitCairn'):
            keep_out.append((p['x'], p['z'], 0.34 if p['kind'] == 'tent' else 0.22))
    for pl in D['features']['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.15))
    return keep_out


# kind: (builder, count, height range, levels, trail clearance, spacing, edge clearance, tall)
KINDS = [
    ('ashTree', ash_tree, 16, (0.34, 0.5), ('lawn', 'tier', 'summit'), 0.26, 0.26, 0.06, True),
    ('obsidian', obsidian, 12, (0.07, 0.13), ('lawn', 'tier', 'summit', 'beach'), 0.2, 0.18, 0.04, False),
    ('rock', lava_rock, 14, (0.08, 0.16), ('lawn', 'tier', 'summit', 'beach'), 0.2, 0.2, 0.05, False),
    ('fern', hardy_fern, 10, (0.06, 0.09), ('lawn', 'tier'), 0.18, 0.12, 0.02, False),
    ('tuft', dry_tuft, 26, (0.05, 0.08), ('beach', 'lawn', 'tier', 'summit'), 0.12, 0.08, 0.0, False),
]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain(cone_offset, rings=32, step=1)
    carve_path(terrain)
    carve_caves(terrain)
    tessellate_tops(terrain, target=0.14)
    colour_terrain(terrain, vo_cap, vo_lip, vo_cliff)
    smooth_shade(terrain, angle=65)  # the flared foot bends a lot; keep it one smooth surface
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    keep_out = landmark_keep_out()
    layout_props(ground, sink, unlit_sink)
    basalt_columns(sink)
    cone = summit_cone(ground, sink, unlit_sink, keep_out)
    lava_falls(ground, sink, unlit_sink, cone, keep_out)
    lava_cracks(ground, unlit_sink)
    vents(ground, sink, unlit_sink, keep_out)
    sea_rocks(sink, unlit_sink)
    path_stones(ground, sink)
    rim_fringe(ground, sink, dry_tuft)
    scatter(ground, sink, unlit_sink, KINDS, keep_out)
    finish(terrain, sink, unlit_sink, sun_angle=20)  # soft shadows: the cone's shadow falls across coarse walls


main()
