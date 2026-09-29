"""Builds the hand-made jungle island (public/models/JungleIsland.glb) in Blender from the exported layout.

Run with Blender's Python (either works):
  blender --background --python scripts/blender/jungle_island.py -- assets-raw/jungle-layout.json assets-raw/JungleIsland.raw.glb
  python scripts/blender/jungle_island.py assets-raw/jungle-layout.json assets-raw/JungleIsland.raw.glb   (with the bpy module)
then `npm run island:pack` compresses it into public/models/.

The island is built on the app's own layout (npm run island:export) so the trail, cairns, camera and hull, which the
app still computes from that layout, line up with this mesh: terrace tops sit exactly at the level heights and the
path surface exactly at the trail heights. Terraces are closed solids joined with booleans, so cliffs have no gaps.

Layout frame: x right, y up, z toward the default camera. Blender frame: P(x, y, z) = (x, -z, y); the glTF exporter
maps it back to y-up.
"""

import json
import math
import random
import sys

import bpy  # before bmesh: the pip bpy module only exposes bmesh once bpy is loaded
import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
IN = args[0] if len(args) > 0 else 'assets-raw/jungle-layout.json'
OUT = args[1] if len(args) > 1 else 'assets-raw/JungleIsland.raw.glb'
D = json.load(open(IN))
PAL = D['palette']
FOL = PAL['foliage']
rng = random.Random(1)

BEACH, LAWN, TIER, SUMMIT = 2, 3, 4, 5
LEVEL_Y = [lv['y'] for lv in D['levels']]
HW = D['trail']['halfWidth']
FLOOR = -0.45


# ---------------------------------------------------------------------------------------------------------- helpers

def P(x, y, z):
    return Vector((x, -z, y))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def col(hex_or_tuple, k=1.0):
    if isinstance(hex_or_tuple, str):
        h = hex_or_tuple.lstrip('#')
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        rgb = list(hex_or_tuple)
    return tuple(srgb_to_linear(max(0.0, min(1.0, c * k))) for c in rgb) + (1.0,)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


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


def new_bm():
    bm = bmesh.new()
    bm.loops.layers.float_color.new('Col')
    return bm


def paint(bm, face, c):
    layer = bm.loops.layers.float_color['Col']
    for loop in face.loops:
        loop[layer] = c


def to_object(bm, name):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def boolean(target, operands, operation):
    coll = bpy.data.collections.new(f'ops_{operation}')
    bpy.context.scene.collection.children.link(coll)
    for o in operands:
        for c in o.users_collection:
            c.objects.unlink(o)
        coll.objects.link(o)
    m = target.modifiers.new('bool', 'BOOLEAN')
    m.operation = operation
    m.operand_type = 'COLLECTION'
    m.collection = coll
    m.solver = 'MANIFOLD'
    apply_modifiers(target)
    for o in list(coll.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)


def outline(level, step=1):
    pts = D['outlines'][level][::step]
    # counter-clockwise in Blender's XY plane
    area = sum(pts[i][0] * (-pts[(i + 1) % len(pts)][1]) - pts[(i + 1) % len(pts)][0] * (-pts[i][1]) for i in range(len(pts)))
    return pts if area > 0 else pts[::-1]


def outward_normals(pts):
    n = len(pts)
    out = []
    for i in range(n):
        a, b = pts[i - 1], pts[(i + 1) % n]
        tx, tz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, tz) or 1
        # CCW in Blender XY == clockwise in layout XZ (z is flipped), so outward is (-tz, tx) in layout coordinates.
        out.append((-tz / length, tx / length))
    return out


def point_in_poly(x, z, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, zi = pts[i]
        xj, zj = pts[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def prism(pts, y0, y1, rings=1, offset=None, name='prism'):
    """Closed solid from outline pts between heights y0 and y1; offset(i, frac, y) pushes ring vertices outward."""
    bm = new_bm()
    normals = outward_normals(pts)
    grid = []
    for k in range(rings + 1):
        f = k / rings
        y = y0 + (y1 - y0) * f
        ring = []
        for i, (x, z) in enumerate(pts):
            d = offset(i, f, y) if offset else 0.0
            ring.append(bm.verts.new(P(x + normals[i][0] * d, y, z + normals[i][1] * d)))
        grid.append(ring)
    n = len(pts)
    for k in range(rings):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]))
    bm.faces.new(list(reversed(grid[0])))
    bm.faces.new(grid[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object(bm, name)


def box_sweep(centre, left, top, bottom, name):
    """Closed solid swept along a polyline: centre[i] = (x, z), left[i] = (lx, lz) half-extents (+normal side),
    top[i]/bottom[i] heights. left may be asymmetric via (left_d, right_d)."""
    bm = new_bm()
    rings = []
    for i, (x, z) in enumerate(centre):
        (nx, nz), (dl, dr) = left[i]
        pts = [(x + nx * dl, top[i], z + nz * dl), (x - nx * dr, top[i], z - nz * dr), (x - nx * dr, bottom[i], z - nz * dr), (x + nx * dl, bottom[i], z + nz * dl)]
        rings.append([bm.verts.new(P(*p)) for p in pts])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object(bm, name)


def disc_prism(x, z, r, y0, y1, sides=18, name='disc'):
    pts = [(x + r * math.cos(2 * math.pi * i / sides), z - r * math.sin(2 * math.pi * i / sides)) for i in range(sides)]
    return prism(pts, y0, y1, name=name)


# ---------------------------------------------------------------------------------------------------------- terrain

def cliff_offset(level, seed):
    lo = LEVEL_Y[level - 1]
    hi = LEVEL_Y[level]

    def off(i, f, y):
        if y >= hi - 1e-6:
            return 0.0
        a = 2 * math.pi * i / 128
        h = (y - lo) / (hi - lo)
        flutes = noise.noise(Vector((math.cos(a) * 9 + seed, math.sin(a) * 9, h * 0.9)))
        blocks = noise.noise(Vector((math.cos(a) * 3 - seed, math.sin(a) * 3, h * 3.2)))
        strata = 0.35 * math.sin(h * 19 + seed)
        d = 0.045 * flutes + 0.035 * blocks + 0.012 * strata
        # a slight outward lean toward the base, and a grass lip that overhangs the top edge
        d += 0.05 * (1 - h)
        if h > 0.93:
            d = -0.012
        return d

    return off


def build_terrain():
    solids = [
        prism(outline(BEACH), FLOOR, LEVEL_Y[BEACH], name='beach'),
        prism(outline(LAWN), FLOOR + 0.05, LEVEL_Y[LAWN], name='lawn'),
    ]
    for level, seed in ((TIER, 3.1), (SUMMIT, 7.7)):
        pts = outline(level, step=2)
        lo = LEVEL_Y[level - 1] - 0.08
        solids.append(prism(pts, lo, LEVEL_Y[level], rings=14, offset=cliff_offset(level, seed), name=f'level{level}'))
    terrain = solids[0]
    boolean(terrain, solids[1:], 'UNION')
    terrain.name = 'terrain'
    return terrain


def trail_runs():
    """Split the trail into runs that turn at most ~40°, so each swept box stays a clean solid."""
    s = D['trail']['samples']
    runs, start, turn = [], 0, 0.0
    for i in range(1, len(s) - 1):
        a = math.atan2(s[i][2] - s[i - 1][2], s[i][0] - s[i - 1][0])
        b = math.atan2(s[i + 1][2] - s[i][2], s[i + 1][0] - s[i][0])
        turn += abs((b - a + math.pi) % (2 * math.pi) - math.pi)
        if turn > math.radians(40) or i - start >= 16:
            runs.append((start, i))
            start, turn = i, 0.0
    runs.append((start, len(s) - 1))
    return runs


def normals_along():
    s = D['trail']['samples']
    out = []
    for i in range(len(s)):
        a, b = s[max(0, i - 1)], s[min(len(s) - 1, i + 1)]
        tx, tz = b[0] - a[0], b[2] - a[2]
        length = math.hypot(tx, tz) or 1
        out.append((-tz / length, tx / length))
    return out


def cut_extent(i, side, path_y):
    """How far the cutter reaches on one side: the path half-width, or further to clear a thin parapet of higher
    terrace left between the path and a lower level."""
    offs = D['trail']['probeOffsets']
    probes = D['trail']['probes'][i]
    pairs = sorted(((abs(d), y) for d, y in zip(offs, probes) if (d > 0) == (side > 0)))
    for d, y in pairs:
        if y <= path_y + 0.03:
            return max(HW, d - 0.02) if any(y2 > path_y + 0.03 for d2, y2 in pairs if d2 < d) else HW
    return HW


def carve_path(terrain):
    s = D['trail']['samples']
    ns = normals_along()
    cutters, supports = [], []
    for a, b in trail_runs():
        idx = list(range(a, b + 1))
        centre = [(s[i][0], s[i][2]) for i in idx]
        ext = [(ns[i], (cut_extent(i, 1, s[i][1]), cut_extent(i, -1, s[i][1]))) for i in idx]
        cutters.append(box_sweep(centre, ext, [s[i][1] + 1.05 for i in idx], [s[i][1] - 0.002 for i in idx], 'cut'))
        sup = [(ns[i], (HW + 0.02, HW + 0.02)) for i in idx]
        supports.append(box_sweep(centre, sup, [s[i][1] for i in idx], [FLOOR + 0.1 for _ in idx], 'support'))
    for a, _ in trail_runs()[1:]:
        cutters.append(disc_prism(s[a][0], s[a][2], HW - 0.005, s[a][1] - 0.002, s[a][1] + 1.05, name='cutJoint'))
        supports.append(disc_prism(s[a][0], s[a][2], HW, FLOOR + 0.1, s[a][1], name='supJoint'))
    end = s[-1]
    cutters.append(disc_prism(end[0], end[2], HW + 0.05, end[1] - 0.002, end[1] + 1.05, name='cutEnd'))
    supports.append(disc_prism(end[0], end[2], HW + 0.05, FLOOR + 0.1, end[1], name='supEnd'))
    boolean(terrain, cutters, 'DIFFERENCE')
    boolean(terrain, supports, 'UNION')


def carve_caves(terrain):
    cutters = []
    for cave in D['features']['caves']:
        w, h = cave['width'] * 1.2, cave['height'] * 1.3
        bm = new_bm()
        prof = [(-w / 2, 0.0)] + [(-w / 2 * math.cos(t), h * 0.55 + h * 0.45 * math.sin(t)) for t in [math.pi * k / 10 for k in range(11)]] + [(w / 2, 0.0)]
        # arch profile in the cave's local (u across, v up), extruded along its facing direction
        yaw = cave['rotY']
        fx, fz = math.sin(yaw), math.cos(yaw)
        ux, uz = math.cos(yaw), -math.sin(yaw)
        front, back = [], []
        for u, v in prof:
            for depth, ring in ((0.25, front), (-0.45, back)):
                x = cave['x'] + ux * u + fx * depth
                z = cave['z'] + uz * u + fz * depth
                ring.append(bm.verts.new(P(x, cave['y'] - 0.01 + v, z)))
        n = len(prof)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((front[i], front[j], back[j], back[i]))
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cutters.append(to_object(bm, 'cave'))
    if cutters:
        boolean(terrain, cutters, 'DIFFERENCE')


def nearest_trail():
    s = D['trail']['samples']
    kd = KDTree(len(s))
    for i, p in enumerate(s):
        kd.insert(Vector((p[0], p[2], 0)), i)
    kd.balance()
    return kd


def grass(co):
    x, z = co.x, -co.y
    n = noise.noise(Vector((x * 1.3, z * 1.3, 4.2))) * 0.7 + noise.noise(Vector((x * 3.7, z * 3.7, 9.1))) * 0.3
    return mix(col(PAL['cap']), col(PAL['capLight']) if n > 0 else col(JUNGLE['leafLight']), min(1.0, abs(n) * 1.6))


def colour_terrain(terrain):
    s = D['trail']['samples']
    kd = nearest_trail()
    bm = bmesh.new()
    bm.from_mesh(terrain.data)
    layer = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')
    caves = D['features']['caves']
    sand, sand_wall = col(PAL['sand']), col(PAL['sandWall'])
    for f in bm.faces:
        c = f.calc_center_median()
        x, y, z = c.x, c.z, -c.y
        nrm = f.normal
        # switchback legs pass close to each other, so match the nearest sample at this face's height
        near = [(d, i) for _, i, d in kd.find_n(Vector((x, z, 0)), 12) if abs(s[i][1] - y) < 0.03]
        dist, idx = min(near) if near else min((d, i) for _, i, d in kd.find_n(Vector((x, z, 0)), 1))
        tp = s[idx]
        on_path = dist < HW + 0.035 and abs(y - tp[1]) < 0.03
        n1 = noise.noise(Vector((x * 2.1, z * 2.1, 0.5)))
        n2 = noise.noise(Vector((x * 6.3, z * 6.3, 1.7)))
        if any(math.hypot(x - cv['x'], z - cv['z']) < cv['width'] * 0.9 and y < cv['y'] + cv['height'] * 1.4 for cv in caves) and nrm.z < 0.5:
            k = col(PAL['crevice'], 0.7)
        elif nrm.z > 0.55:
            if on_path:
                edge = dist > HW - 0.03
                k = col(PAL['pathEdge'] if edge else PAL['path'], 1 + 0.04 * n2)
                if tp[4] >= 0 and not edge and int(tp[5] / 0.13) % 2 == 0:
                    k = col(PAL['tread'], 1 + 0.03 * n2)
            elif y < LEVEL_Y[BEACH] + 0.03:
                k = col(PAL['sand'], 1 + 0.03 * n2)
            else:
                k = None  # grass: coloured per corner below, so large caps get a soft gradient
        else:
            if y < LEVEL_Y[BEACH] + 0.01:
                k = sand_wall
            elif y < LEVEL_Y[LAWN] + 0.005 and y > LEVEL_Y[BEACH] - 0.01:
                k = col(PAL['lip'])
            else:
                level = TIER if y < LEVEL_Y[TIER] + 0.01 else SUMMIT
                top, bottom = LEVEL_Y[level], LEVEL_Y[level - 1]
                h = (y - bottom) / (top - bottom)
                tone = PAL['cliffLit'] if n1 > 0.2 else PAL['cliffShade'] if n1 < -0.2 else PAL['cliff']
                k = col(tone, 0.92 + 0.12 * (0.5 + 0.5 * n2))
                if h < 0.14:
                    k = col(PAL['cliffBase'], 0.95 + 0.1 * n2)
                elif h > 0.955:
                    k = col(JUNGLE['moss'])
                elif h > 0.88:
                    k = col(PAL['cliffRim'])
        for loop in f.loops:
            loop[layer] = k if k is not None else grass(loop.vert.co)
    bm.to_mesh(terrain.data)
    bm.free()


# ---------------------------------------------------------------------------------------------------------- water

def ring_mesh(outer, inner, y, colour_outer, colour_inner, name):
    bm = new_bm()
    n = len(outer)
    vo = [bm.verts.new(P(x, y, z)) for x, z in outer]
    vi = [bm.verts.new(P(x, y, z)) for x, z in inner]
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((vo[i], vo[j], vi[j], vi[i]))
        paint(bm, f, colour_outer)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return to_object(bm, name)


def shrink(pts, d):
    ns = outward_normals(pts)
    return [(x - ns[i][0] * d, z - ns[i][1] * d) for i, (x, z) in enumerate(pts)]


def build_water():
    parts = []
    beach = outline(BEACH)
    parts.append(ring_mesh(outline(0), shrink(beach, 0.05), -0.042, col(PAL['shallow']), None, 'shallow'))
    parts.append(ring_mesh(outline(1), shrink(beach, 0.03), -0.036, col(PAL['foam']), None, 'foam'))
    return parts



# ---------------------------------------------------------------------------------------------------------- props
# Every builder writes straight into a shared bmesh through a local→world matrix M (Blender frame, z up, base at 0).

class Sink:
    def __init__(self):
        self.bm = new_bm()
        self.layer = self.bm.loops.layers.float_color['Col']

    def face(self, M, pts, c, double=False):
        vs = [self.bm.verts.new(M @ Vector(p)) for p in pts]
        f = self.bm.faces.new(vs)
        for loop in f.loops:
            loop[self.layer] = c
        if double:
            vs2 = [self.bm.verts.new(M @ Vector(p)) for p in reversed(pts)]
            f2 = self.bm.faces.new(vs2)
            for loop in f2.loops:
                loop[self.layer] = c
        return f

    def cyl(self, M, pts, radii, sides, colours, cap_top=None):
        """Tube through local points pts with per-point radii; colours[i] colours the segment above point i."""
        rings = []
        for i, p in enumerate(pts):
            a = Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])
            a.normalize()
            ref = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
            u = a.cross(ref).normalized()
            v = a.cross(u).normalized()
            rings.append([self.bm.verts.new(M @ (Vector(p) + (u * math.cos(t) + v * math.sin(t)) * radii[i]))
                          for t in [2 * math.pi * k / sides for k in range(sides)]])
        for i in range(len(rings) - 1):
            for k in range(sides):
                f = self.bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
                for loop in f.loops:
                    loop[self.layer] = colours[min(i, len(colours) - 1)]
        if cap_top:
            f = self.bm.faces.new(rings[-1])
            for loop in f.loops:
                loop[self.layer] = cap_top

    def blob(self, M, centre, radius, top, side, bottom, subdiv=1, squash=1.0, jitter=0.22, seed=0.0, smooth=False):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius, matrix=Matrix.Identity(4))
        verts = res['verts']
        for v in verts:
            n = noise.noise(v.co * (3.0 / radius) + Vector((seed, seed * 1.7, 0)))
            v.co = Vector((v.co.x, v.co.y, v.co.z * squash)) * (1 + jitter * n) + Vector(centre)
            v.co = M @ v.co
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.normal_update()
            f.smooth = smooth
            nz = f.normal.z
            c = top if nz > 0.45 else bottom if nz < -0.35 else side
            for loop in f.loops:
                loop[self.layer] = c


def frame(x, z, y, yaw=0.0, scale=1.0, tilt=(0.0, 0.0)):
    return Matrix.Translation(P(x, y, z)) @ Matrix.Rotation(tilt[0], 4, 'X') @ Matrix.Rotation(tilt[1], 4, 'Y') @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(scale, 4)


def frond(sink, M, base, yaw, length, width, lift, droop, c0, c1, segs=5):
    d = Vector((math.cos(yaw), math.sin(yaw), 0))
    side = Vector((-d.y, d.x, 0))
    spine = []
    for k in range(segs + 1):
        u = k / segs
        spine.append(Vector(base) + d * length * u + Vector((0, 0, length * (lift * u - droop * u * u))))
    for k in range(segs):
        u0, u1 = k / segs, (k + 1) / segs
        w0 = width * math.sin(math.pi * min(0.98, u0 * 0.95 + 0.05)) ** 0.8
        w1 = width * math.sin(math.pi * min(0.98, u1 * 0.95 + 0.05)) ** 0.8
        c = mix(c0, c1, u1)
        for sgn in (1, -1):
            e0 = spine[k] + side * sgn * w0 - Vector((0, 0, w0 * 0.35))
            e1 = spine[k + 1] + side * sgn * w1 - Vector((0, 0, w1 * 0.35))
            sink.face(M, [spine[k], spine[k + 1], e1, e0] if sgn > 0 else [spine[k], e0, e1, spine[k + 1]], c, double=True)


def palm(sink, M, h, r):
    lean = r.uniform(0.18, 0.4) * h
    pts = [(lean * (t * t), 0, h * t) for t in [k / 7 for k in range(8)]]
    radii = [0.034 * (1 - 0.35 * k / 7) for k in range(8)]
    rings = [col(FOL['palmTrunk']) if k % 2 == 0 else col(FOL['palmRing']) for k in range(7)]
    sink.cyl(M, pts, radii, 6, rings)
    top = Vector(pts[-1])
    n = r.randint(7, 9)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.2, 0.2)
        frond(sink, M, top, yaw, h * r.uniform(0.5, 0.62), 0.055 * h / 0.7, r.uniform(0.25, 0.55), r.uniform(0.8, 1.1),
              col(FOL['frond']), col(FOL['frondTip']))
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        sink.blob(M, top + Vector((math.cos(a) * 0.025, math.sin(a) * 0.025, -0.02)), 0.02, col(JUNGLE['bark']), col(JUNGLE['barkDark']), col(JUNGLE['barkDark']), subdiv=0, jitter=0.0)


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
    k = r.randint(5, 7)
    for i in range(k):
        a = 2 * math.pi * i / k + r.uniform(-0.3, 0.3)
        rr = h * r.uniform(0.17, 0.24)
        off = Vector((math.cos(a) * h * 0.2, math.sin(a) * h * 0.2, h * r.uniform(0.02, 0.14)))
        sink.blob(M, top + off, rr, lit, mid, shade, squash=0.78, jitter=0.12, seed=r.uniform(0, 50), smooth=True)
    sink.blob(M, top + Vector((0, 0, h * 0.24)), h * 0.24, lit, mid, deep, squash=0.8, jitter=0.12, seed=r.uniform(0, 50), smooth=True)


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
    for i in range(r.randint(2, 3)):
        a = r.uniform(0, 2 * math.pi)
        rr = h * r.uniform(0.45, 0.6)
        c = Vector((math.cos(a) * h * 0.35, math.sin(a) * h * 0.35, rr * 0.7))
        sink.blob(M, c, rr, col(JUNGLE['leafLight']), col(FOL['bush']), col(JUNGLE['leaf']), squash=0.85, jitter=0.12, seed=r.uniform(0, 50), smooth=True)


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


def campfire(sink, unlit, M, r):
    for i in range(8):
        a = 2 * math.pi * i / 8
        sink.blob(M, (math.cos(a) * 0.075, math.sin(a) * 0.075, 0.012), 0.022, col(FOL['campfireStone']), col(FOL['campfireStone'], 0.9), col(FOL['campfireStone'], 0.8), subdiv=0, jitter=0.1, seed=i)
    for i in range(3):
        a = math.pi * i / 3
        d = Vector((math.cos(a), math.sin(a), 0)) * 0.06
        sink.cyl(M, [tuple(-d + Vector((0, 0, 0.01))), tuple(d + Vector((0, 0, 0.025)))], [0.01, 0.01], 5, [col(FOL['log'])])
    for (x, y, hh, rr, c) in ((0, 0, 0.1, 0.035, col(FOL['ember'])), (0.012, 0.01, 0.07, 0.02, col('#FFD27A'))):
        for k in range(5):
            a0, a1 = 2 * math.pi * k / 5, 2 * math.pi * (k + 1) / 5
            unlit.face(M, [(x + math.cos(a0) * rr, y + math.sin(a0) * rr, 0.02), (x + math.cos(a1) * rr, y + math.sin(a1) * rr, 0.02), (x, y, 0.02 + hh)], c)


def summit_cairn(sink, M, r):
    z = 0.0
    for i, rr in enumerate((0.08, 0.065, 0.05, 0.035)):
        hh = rr * 0.7
        sink.blob(M, (r.uniform(-0.01, 0.01), r.uniform(-0.01, 0.01), z + hh / 2), rr, col(FOL['campfireStone']), col(FOL['campfireStone'], 0.9), col(FOL['campfireStone'], 0.8), subdiv=1, squash=0.45, jitter=0.08, seed=i * 3)
        z += hh * 0.85


def signpost(sink, M, r):
    sink.cyl(M, [(0, 0, 0), (0, 0, 0.3)], [0.012, 0.011], 5, [col(FOL['log'])])
    sink.face(M, [(-0.01, -0.09, 0.2), (-0.01, 0.07, 0.2), (-0.01, 0.1, 0.24), (-0.01, 0.07, 0.28), (-0.01, -0.09, 0.28)], col(FOL['stumpInner']), double=True)


def lily(sink, M, r):
    pts = [(math.cos(a) * 0.05, math.sin(a) * 0.05, 0) for a in [0.4 + 2 * math.pi * k / 9 * 0.95 for k in range(10)]] + [(0, 0, 0)]
    sink.face(M, pts, col(FOL['lily']))
    if r.random() < 0.6:
        flower(sink, M @ Matrix.Translation((0.01, 0, 0)), 0.015, r)


# ---------------------------------------------------------------------------------------------------------- placement

class Ground:
    def __init__(self, terrain):
        dg = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(terrain, dg)
        s = D['trail']['samples']
        self.samples = s
        self.kd = nearest_trail()

    def at(self, x, z):
        hit = self.bvh.ray_cast(P(x, 6, z), Vector((0, 0, -1)))
        if hit[0] is None:
            return None, 0.0
        return hit[0].z, hit[1].z

    def flat(self, x, z, y, r):
        for a in range(6):
            t = 2 * math.pi * a / 6
            yy, nz = self.at(x + r * math.cos(t), z + r * math.sin(t))
            if yy is None or abs(yy - y) > 0.01:
                return False
        return True

    def trail_distance(self, x, z, y):
        best = 9.0
        for _, i, d in self.kd.find_n(Vector((x, z, 0)), 24):
            if self.samples[i][1] > y - 0.35:
                best = min(best, d)
        return best

    def blocks_trail(self, x, z, y, h):
        """Default camera looks from layout +z, 38° down: would something h tall here hide a trail sample behind it?"""
        reach = (y + h) / math.tan(math.radians(38))
        for sx, sy, sz, *_ in self.samples:
            if sz < z and abs(sx - x) < 0.22 and z - sz < (y + h - sy) / math.tan(math.radians(38)) + 0.05 and z - sz < reach:
                return True
        return False

    def wall_point(self, x, y, z, nx, nz):
        """First terrain hit shooting inward (−n) from outside the outline at height y."""
        o = P(x + nx * 0.6, y, z + nz * 0.6)
        hit = self.bvh.ray_cast(o, Vector((-nx, nz, 0)).normalized(), 1.5)
        return None if hit[0] is None else Vector((hit[0].x, -hit[0].y))


LEVEL_TOPS = {'beach': LEVEL_Y[BEACH], 'lawn': LEVEL_Y[LAWN], 'tier': LEVEL_Y[TIER], 'summit': LEVEL_Y[SUMMIT]}

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


def level_of(y):
    for name, top in LEVEL_TOPS.items():
        if abs(y - top) < 0.004:
            return name
    return None


def scatter(ground, sink, unlit):
    feats = D['features']
    keep_out = []  # (x, z, r)
    for p in D['props']:
        if p['kind'] in ('tent', 'campfire', 'signpost', 'summitCairn'):
            keep_out.append((p['x'], p['z'], 0.32 if p['kind'] == 'tent' else 0.2))
    for pl in feats['pillars']:
        keep_out.append((pl['x'], pl['z'], pl['r'] + 0.08))
    placed = []  # (x, z, r_spacing, tall)
    cells = []
    step = 0.075
    n = int(6.4 / step)
    for i in range(n):
        for j in range(n):
            cells.append((-3.2 + i * step + rng.uniform(0, step), -3.2 + j * step + rng.uniform(0, step)))
    rng.shuffle(cells)
    samples = []
    for x, z in cells:
        y, nz = ground.at(x, z)
        if y is None or nz < 0.98:
            continue
        lv = level_of(y)
        if lv:
            samples.append((x, z, y, lv))
    counts = {}
    for name, builder, count, hr, levels, clear, spacing, edge, tall in KINDS:
        for x, z, y, lv in samples:
            if counts.get(name, 0) >= count:
                break
            if lv not in levels:
                continue
            if name == 'palm' and lv == 'tier' and rng.random() < 0.7:
                continue
            if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out):
                continue
            if ground.trail_distance(x, z, y) < clear:
                continue
            if any(math.hypot(x - px, z - pz) < max(spacing, ps) * (1.0 if (tall or ptall) else 0.7) for px, pz, ps, ptall in placed):
                continue
            h = rng.uniform(*hr)
            if edge and not ground.flat(x, z, y, edge):
                continue
            if tall and ground.blocks_trail(x, z, y, h):
                continue
            yaw = rng.uniform(0, 2 * math.pi)
            M = frame(x, z, y - 0.004, yaw)
            if name == 'palm':
                # lean away from the island centre
                away = math.atan2(-z, x)
                M = frame(x, z, y - 0.004, 0) @ Matrix.Rotation(away, 4, 'Z')
            builder(sink, M, h, rng)
            placed.append((x, z, spacing, tall))
            counts[name] = counts.get(name, 0) + 1
    print('scatter', counts)


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


def fall_ribbon(unlit, pts, width, name_seed):
    """Waterfall strip through world points pts (layout frame, top to bottom), offset just outside the wall."""
    fall, streak = col(PAL['fall']), col(PAL['fallStreak'])
    for i in range(len(pts) - 1):
        (x0, y0, z0, nx0, nz0), (x1, y1, z1, nx1, nz1) = pts[i], pts[i + 1]
        stripes = 5
        for k in range(stripes):
            u0, u1 = -width / 2 + width * k / stripes, -width / 2 + width * (k + 1) / stripes
            c = streak if (k + i) % 3 == 0 else fall
            q = [P(x0 - nz0 * u0, y0, z0 + nx0 * u0), P(x0 - nz0 * u1, y0, z0 + nx0 * u1), P(x1 - nz1 * u1, y1, z1 + nx1 * u1), P(x1 - nz1 * u0, y1, z1 + nx1 * u0)]
            unlit.face(Matrix.Identity(4), [tuple(v) for v in q], c, double=True)


def splash(unlit, x, z, y, r):
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        cx, cz = x + math.cos(a) * r * 0.6, z + math.sin(a) * r * 0.6
        pts = [(cx + math.cos(t) * r * 0.55, cz + math.sin(t) * r * 0.55) for t in [2 * math.pi * m / 8 for m in range(8)]]
        unlit.face(Matrix.Identity(4), [tuple(P(px, y + 0.004 + 0.002 * k, pz)) for px, pz in pts][::-1], col(PAL['foam']))


def waterfalls(ground, sink, unlit):
    fall = D['features']['fall']
    if fall:
        pts = []
        dx, dz = fall['dir']
        for x, y, z in fall['samples']:
            pts.append((x + dx * 0.02, y, z + dz * 0.02, dx, dz))
        fall_ribbon(unlit, pts, 0.16, 1)
        bx, by, bz = fall['samples'][-1]
        splash(unlit, bx + dx * 0.08, bz + dz * 0.08, by, 0.12)
    # A second, front-facing fall from the tier onto the lawn, into a pool, clear of the trail and camp.
    pts = outline(TIER, 2)
    ns = outward_normals(pts)
    best = None
    for i, (x, z) in enumerate(pts):
        facing = ns[i][1]  # toward layout +z (the camera)
        if facing < 0.55 or x < 0.1:
            continue
        clear = ground.trail_distance(x, z, 0.0)
        camp = min(math.hypot(x - p['x'], z - p['z']) for p in D['props'] if p['kind'] in ('tent', 'campfire'))
        cave = min((math.hypot(x - c['x'], z - c['z']) for c in D['features']['caves']), default=9)
        if clear < 0.6 or camp < 0.5 or cave < 0.45:
            continue
        score = clear + facing
        if best is None or score > best[0]:
            best = (score, i)
    if best is None:
        return
    x, z = pts[best[1]]
    nx, nz = ns[best[1]]
    col_pts = []
    lo, hi = LEVEL_Y[LAWN], LEVEL_Y[TIER]
    for k in range(9):
        y = hi - (hi - lo) * k / 8
        w = ground.wall_point(x, min(y, hi - 0.01), z, nx, nz)
        wx, wz = (w.x, w.y) if w is not None else (x, z)
        col_pts.append((wx + nx * 0.025, y + (0.004 if k == 0 else 0), wz + nz * 0.025, nx, nz))
    fall_ribbon(unlit, col_pts, 0.14, 2)
    # stream across the tier top into the fall, and a pool at its foot
    fall, streak = col(PAL['fall']), col(PAL['fallStreak'])
    for k in range(4):
        a0, a1 = k / 4 * 0.4, (k + 1) / 4 * 0.4
        q = [P(x - nx * a0 - nz * 0.05, hi + 0.004, z - nz * a0 + nx * 0.05), P(x - nx * a0 + nz * 0.05, hi + 0.004, z - nz * a0 - nx * 0.05),
             P(x - nx * a1 + nz * 0.05, hi + 0.004, z - nz * a1 - nx * 0.05), P(x - nx * a1 - nz * 0.05, hi + 0.004, z - nz * a1 + nx * 0.05)]
        unlit.face(Matrix.Identity(4), [tuple(v) for v in q], fall if k % 2 else streak, double=True)
    px, pz = col_pts[-1][0] + nx * 0.14, col_pts[-1][2] + nz * 0.14
    ring = [(px + math.cos(t) * 0.2, pz + math.sin(t) * 0.16) for t in [2 * math.pi * m / 16 for m in range(16)]]
    unlit.face(Matrix.Identity(4), [tuple(P(rx, lo + 0.003, rz)) for rx, rz in ring][::-1], col(PAL['pool']))
    for m in range(16):
        a, b = ring[m], ring[(m + 1) % 16]
        ao = (px + (a[0] - px) * 1.2, pz + (a[1] - pz) * 1.2)
        bo = (px + (b[0] - px) * 1.2, pz + (b[1] - pz) * 1.2)
        unlit.face(Matrix.Identity(4), [tuple(P(*a2)) for a2 in ((a[0], lo + 0.0035, a[1]), (ao[0], lo + 0.0035, ao[1]), (bo[0], lo + 0.0035, bo[1]), (b[0], lo + 0.0035, b[1]))], col(PAL['foam']), double=True)
    splash(unlit, col_pts[-1][0] + nx * 0.06, col_pts[-1][2] + nz * 0.06, lo + 0.004, 0.08)
    for a in (-0.5, 0.6):
        rock(sink, frame(px + math.cos(a) * 0.26, pz + math.sin(a) * 0.22, lo), 0.08, rng)


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

# ---------------------------------------------------------------------------------------------------------- main

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    terrain = build_terrain()
    carve_path(terrain)
    carve_caves(terrain)
    colour_terrain(terrain)
    ground = Ground(terrain)
    sink, unlit_sink = Sink(), Sink()
    layout_props(ground, sink, unlit_sink)
    pillars_and_rocks(sink, unlit_sink)
    waterfalls(ground, sink, unlit_sink)
    vines(ground, sink)
    scatter(ground, sink, unlit_sink)
    lit = [terrain, to_object(sink.bm, 'props')]
    unlit = build_water() + [to_object(unlit_sink.bm, 'unlitProps')]
    for group, name in ((lit, 'Lit'), (unlit, 'Unlit')):
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        with bpy.context.temp_override(active_object=group[0], selected_editable_objects=group, selected_objects=group):
            bpy.ops.object.join()
        group[0].name = name
        group[0].data.name = name
        for o in bpy.context.selected_objects:
            o.select_set(False)
    for ob in bpy.data.objects:
        ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_materials='NONE', export_yup=True)
    print('triangles', {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects})


main()
