"""Shared pipeline for the hand-built islands (scripts/blender/<biome>_island.py): layout loading, terrain solids, the
path cut, cave cut, top tessellation, terrain colouring, water rings, the prop Sink, placement (Ground, scatter),
streams and falls, the lighting bake and the glTF export.

A biome script calls init('<biome>') and then `from island_core import *`, adds its own dressing, and calls finish().

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

BEACH, LAWN, TIER, SUMMIT = 2, 3, 4, 5
FLOOR = -0.45
STREAMS = []  # (x0, z0, x1, z1): plants keep off these
WATER_LEVEL = -0.036
D = PAL = FOL = LEVEL_Y = HW = LEVEL_TOPS = IN = OUT = None
rng = random.Random(1)


def init(biome):
    """Loads the layout named on the command line (default assets-raw/<biome>-layout.json) and sets the globals."""
    global D, PAL, FOL, LEVEL_Y, HW, LEVEL_TOPS, IN, OUT
    name = biome[0].upper() + biome[1:] + 'Island'
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    IN = args[0] if len(args) > 0 else f'assets-raw/{biome}-layout.json'
    OUT = args[1] if len(args) > 1 else f'assets-raw/{name}.raw.glb'
    D = json.load(open(IN))
    PAL = D['palette']
    FOL = PAL['foliage']
    LEVEL_Y = [lv['y'] for lv in D['levels']]
    HW = D['trail']['halfWidth']
    LEVEL_TOPS = {'beach': LEVEL_Y[BEACH], 'lawn': LEVEL_Y[LAWN], 'tier': LEVEL_Y[TIER], 'summit': LEVEL_Y[SUMMIT]}

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


def build_terrain(cliff=cliff_offset, rings=14):
    solids = [
        prism(outline(BEACH), FLOOR, LEVEL_Y[BEACH], name='beach'),
        prism(outline(LAWN), FLOOR + 0.05, LEVEL_Y[LAWN], name='lawn'),
    ]
    for level, seed in ((TIER, 3.1), (SUMMIT, 7.7)):
        pts = outline(level, step=2)
        lo = LEVEL_Y[level - 1] - 0.08
        solids.append(prism(pts, lo, LEVEL_Y[level], rings=rings, offset=cliff(level, seed), name=f'level{level}'))
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


def path_test():
    s = D['trail']['samples']
    kd = nearest_trail()

    def on_path(x, y, z, margin=0.035):
        near = [(d, i) for _, i, d in kd.find_n(Vector((x, z, 0)), 12) if abs(s[i][1] - y) < 0.03]
        return bool(near) and min(near)[0] < HW + margin

    return on_path


def tessellate_tops(terrain, target=0.16):
    """Splits the big flat caps (not the path) into small triangles so baked shadows, AO and grass tint have vertices
    to live on."""
    on_path = path_test()
    bm = bmesh.new()
    bm.from_mesh(terrain.data)

    def grass_face(f):
        if f.normal.z <= 0.9:
            return False
        c = f.calc_center_median()
        return c.z > LEVEL_Y[BEACH] + 0.03 and not on_path(c.x, c.z, -c.y, 0.06)

    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if grass_face(f) and len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')
    for _ in range(8):
        grass_faces = [f for f in bm.faces if grass_face(f)]
        long_edges = list({e for f in grass_faces for e in f.edges if e.calc_length() > target and all(grass_face(g) for g in e.link_faces)})
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3 and f.normal.z > 0.9], quad_method='BEAUTY', ngon_method='BEAUTY')
    grass_faces = [f for f in bm.faces if grass_face(f)]
    bmesh.ops.beautify_fill(bm, faces=grass_faces, edges=list({e for f in grass_faces for e in f.edges if all(grass_face(g) for g in e.link_faces)}))
    bm.to_mesh(terrain.data)
    bm.free()


def colour_terrain(terrain, cap, lip, cliff):
    """Path, beach sand and walls by face; cap(co) colours each corner of a terrace top, lip(x, y, z, n1, n2) the
    lawn wall and cliff(level, h, n1, n2, x, y, z) the cliff faces (h: 0 at the foot, 1 at the top)."""
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
                k = None  # terrace top: coloured per corner below, so large caps get a soft gradient
        else:
            if y < LEVEL_Y[BEACH] + 0.01:
                k = sand_wall
            elif y < LEVEL_Y[LAWN] + 0.005 and y > LEVEL_Y[BEACH] - 0.01:
                k = lip(x, y, z, n1, n2)
            else:
                level = TIER if y < LEVEL_Y[TIER] + 0.01 else SUMMIT
                top, bottom = LEVEL_Y[level], LEVEL_Y[level - 1]
                k = cliff(level, (y - bottom) / (top - bottom), n1, n2, x, y, z)
        for loop in f.loops:
            loop[layer] = k if k is not None else cap(loop.vert.co)
    bm.to_mesh(terrain.data)
    bm.free()


# ---------------------------------------------------------------------------------------------------------- water

def gradient_rings(rings, y, name):
    """Concentric bands between outlines with per-vertex colour, so shallows and foam fade instead of stepping."""
    bm = new_bm()
    layer = bm.loops.layers.float_color['Col']
    verts = [[bm.verts.new(P(x, y, z)) for x, z in pts] for pts, _ in rings]
    n = len(rings[0][0])
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((verts[r][i], verts[r][j], verts[r + 1][j], verts[r + 1][i]))
            for loop in f.loops:
                loop[layer] = rings[r][1] if loop.vert in (verts[r][i], verts[r][j]) else rings[r + 1][1]
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return to_object(bm, name)


def lerp_outline(a, b, t):
    return [(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t) for pa, pb in zip(a, b)]


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
    halo, foam_edge = outline(0), outline(1)
    water, shallow, foam = col(PAL['water']), col(PAL['shallow']), col(PAL['foam'])
    parts.append(gradient_rings([(shrink(beach, 0.05), shallow), (beach, shallow), (lerp_outline(beach, halo, 0.45), mix(shallow, water, 0.55)), (halo, water)], -0.042, 'shallow'))
    parts.append(gradient_rings([(shrink(beach, 0.03), foam), (beach, foam), (lerp_outline(beach, foam_edge, 0.5), mix(foam, shallow, 0.45)), (foam_edge, shallow)], -0.036, 'foam'))
    return parts


# ---------------------------------------------------------------------------------------------------------- props
# Every builder writes straight into a shared bmesh through a local→world matrix M (Blender frame, z up, base at 0).

class Sink:
    def __init__(self):
        self.bm = new_bm()
        self.layer = self.bm.loops.layers.float_color['Col']
        # smooth-shaded foliage (tree crowns, bushes) goes to its own mesh, drawn with the soft Lambert material
        self.soft = new_bm()

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
        bm = self.soft if smooth else self.bm
        layer = bm.loops.layers.float_color['Col']
        res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius, matrix=Matrix.Identity(4))
        verts = res['verts']
        for v in verts:
            n = noise.noise(v.co * (3.0 / radius) + Vector((seed, seed * 1.7, 0)))
            v.co = Vector((v.co.x, v.co.y, v.co.z * squash)) * (1 + jitter * n) + Vector(centre)
            v.co = M @ v.co
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.normal_update()
            f.smooth = smooth
            if smooth:
                continue
            nz = f.normal.z
            c = top if nz > 0.45 else bottom if nz < -0.35 else side
            for loop in f.loops:
                loop[layer] = c
        if smooth:  # per-vertex colour, so the crown shades from lit top to dark underside without facets
            for f in faces:
                for loop in f.loops:
                    nz = (loop.vert.co - (M @ Vector(centre))).normalized().z
                    loop[layer] = mix(bottom, side, min(1, (nz + 1) / 1.2)) if nz < 0.2 else mix(side, top, min(1, (nz - 0.2) / 0.6))


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


def palm(sink, M, h, r, c):
    """c: trunk, ring, frond, tip, nut, nutDark colours."""
    lean = r.uniform(0.18, 0.4) * h
    pts = [(lean * (t * t), 0, h * t) for t in [k / 7 for k in range(8)]]
    radii = [0.034 * (1 - 0.35 * k / 7) for k in range(8)]
    rings = [c['trunk'] if k % 2 == 0 else c['ring'] for k in range(7)]
    sink.cyl(M, pts, radii, 6, rings)
    top = Vector(pts[-1])
    n = r.randint(7, 9)
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.2, 0.2)
        frond(sink, M, top, yaw, h * r.uniform(0.5, 0.62), 0.055 * h / 0.7, r.uniform(0.25, 0.55), r.uniform(0.8, 1.1),
              c['frond'], c['tip'])
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        sink.blob(M, top + Vector((math.cos(a) * 0.025, math.sin(a) * 0.025, -0.02)), 0.02, c['nut'], c['nutDark'], c['nutDark'], subdiv=0, jitter=0.0)


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


def box(sink, M, lo, hi, top, side, bottom=None):
    """Axis-aligned box in local frame between corners lo and hi."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    for idx, c in (((4, 5, 6, 7), top), ((0, 1, 5, 4), side), ((1, 2, 6, 5), side), ((2, 3, 7, 6), side), ((3, 0, 4, 7), side), ((3, 2, 1, 0), bottom or side)):
        sink.face(M, [v[i] for i in idx], c)


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



# ---------------------------------------------------------------------------------------------------------- placement

class Ground:
    def __init__(self, terrain):
        dg = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(terrain, dg)
        s = D['trail']['samples']
        self.samples = s
        self.kd = nearest_trail()
        # points the default camera must see: the trail, plus the camp
        self.watched = [(p[0], p[1], p[2]) for p in s] + [(p['x'], p['y'] + 0.1, p['z']) for p in D['props'] if p['kind'] in ('tent', 'campfire')]

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
        for sx, sy, sz in self.watched:
            if sz < z and abs(sx - x) < 0.22 and z - sz < (y + h - sy) / math.tan(math.radians(38)) + 0.05 and z - sz < reach:
                return True
        return False

    def wall_point(self, x, y, z, nx, nz):
        """First terrain hit shooting inward (−n) from outside the outline at height y."""
        o = P(x + nx * 0.6, y, z + nz * 0.6)
        hit = self.bvh.ray_cast(o, Vector((-nx, nz, 0)).normalized(), 1.5)
        return None if hit[0] is None else Vector((hit[0].x, -hit[0].y))



def level_of(y):
    for name, top in LEVEL_TOPS.items():
        if abs(y - top) < 0.004:
            return name
    return None


def seg_distance(x, z, x0, z0, x1, z1):
    vx, vz = x1 - x0, z1 - z0
    t = max(0.0, min(1.0, ((x - x0) * vx + (z - z0) * vz) / (vx * vx + vz * vz + 1e-12)))
    return math.hypot(x - (x0 + vx * t), z - (z0 + vz * t))


def rim_fringe(ground, sink, tuft):
    """Tufts along each terrace rim so edges read soft and overgrown rather than cut."""
    for level in (LAWN, TIER, SUMMIT):
        pts = outline(level, 2)
        ns = outward_normals(pts)
        y = LEVEL_Y[level]
        for i in range(0, len(pts), 2 if level > LAWN else 3):
            x, z = pts[i]
            nx, nz = ns[i]
            px, pz = x - nx * 0.035, z - nz * 0.035
            if ground.trail_distance(px, pz, y) < HW + 0.06:
                continue
            gy, _ = ground.at(px, pz)
            if gy is None or abs(gy - y) > 0.01:
                continue
            M = frame(px, pz, y - 0.004, rng.uniform(0, 2 * math.pi)) @ Matrix.Rotation(0.5, 4, 'X')
            tuft(sink, M, rng.uniform(0.05, 0.09), rng)


def path_stones(ground, sink):
    """Small stones along the path edges on the flat stretches."""
    s = D['trail']['samples']
    ns = normals_along()
    for i in range(3, len(s) - 3, 4):
        if s[i][4] >= 0 or rng.random() < 0.45:
            continue
        side = 1 if (i // 4) % 2 else -1
        nx, nz = ns[i]
        x, z = s[i][0] + nx * side * (HW + 0.025), s[i][2] + nz * side * (HW + 0.025)
        gy, nzn = ground.at(x, z)
        if gy is None or abs(gy - s[i][1]) > 0.02:
            continue
        sink.blob(frame(x, z, gy), (0, 0, 0.006), rng.uniform(0.018, 0.03), col(FOL['campfireStone']), col(FOL['campfireStone'], 0.88), col(FOL['campfireStone'], 0.75), subdiv=0, squash=0.55, jitter=0.15, seed=i)


def scatter(ground, sink, unlit, kinds, keep_out=()):
    """Scatters kinds (name, builder, count, height range, levels, trail clearance, spacing, edge clearance, tall) over
    the flat terrace tops, clear of keep_out (x, z, r), streams, the trail and the default camera's view of it."""
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
    for name, builder, count, hr, levels, clear, spacing, edge, tall in kinds:
        for x, z, y, lv in samples:
            if counts.get(name, 0) >= count:
                break
            if lv not in levels:
                continue
            if name == 'palm' and lv == 'tier' and rng.random() < 0.7:
                continue
            if any(math.hypot(x - kx, z - kz) < kr for kx, kz, kr in keep_out):
                continue
            if any(seg_distance(x, z, *st) < 0.13 for st in STREAMS):
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


def fall_ribbon(unlit, pts, width, name_seed):
    """Waterfall strip through world points pts (layout frame, top to bottom), offset just outside the wall."""
    fall = col(PAL['fall'])
    streak = mix(fall, col(PAL['fallStreak']), 0.45)
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


def stream(unlit, x0, z0, x1, z1, y, width=0.1):
    STREAMS.append((x0, z0, x1, z1))
    fall = col(PAL['fall'])
    streak = mix(fall, col(PAL['fallStreak']), 0.35)
    length = math.hypot(x1 - x0, z1 - z0)
    if length < 1e-3:
        return
    dx, dz = (x1 - x0) / length, (z1 - z0) / length
    nx, nz = -dz * width / 2, dx * width / 2
    steps = max(1, int(length / 0.08))
    for k in range(steps):
        a, b = k / steps, (k + 1) / steps
        ax, az, bx, bz = x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, z0 + (z1 - z0) * b
        q = [P(ax + nx, y, az + nz), P(ax - nx, y, az - nz), P(bx - nx, y, bz - nz), P(bx + nx, y, bz + nz)]
        unlit.face(Matrix.Identity(4), [tuple(v) for v in q], streak if k % 3 == 0 else fall, double=True)


def cascade(ground, unlit, x, z, dx, dz):
    """Water that follows the terrain from (x, z) along (dx, dz): a stream across each flat level, a fall down each
    drop, until it reaches the sea."""
    length = math.hypot(dx, dz) or 1
    dx, dz = dx / length, dz / length
    y, _ = ground.at(x, z)
    step = 0.02
    for _ in range(12):
        # walk the stream to the edge of the current level
        sx, sz = x, z
        while True:
            ny, _ = ground.at(x + dx * step, z + dz * step)
            if ny is None or ny < y - 0.02:
                break
            x, z = x + dx * step, z + dz * step
        stream(unlit, sx, sz, x, z, y + 0.004)
        ny, _ = ground.at(x + dx * 0.08, z + dz * 0.08)
        lower = WATER_LEVEL if ny is None else ny
        # the fall hugs the wall: find the wall surface at each height, just outside it
        pts = []
        for k in range(7):
            yy = y - (y - lower) * k / 6
            w = ground.wall_point(x, min(yy, y - 0.005), z, dx, dz) if 0 < k < 6 else None
            wx, wz = (w.x, w.y) if w is not None else (x, z)
            if k == 6:
                wx, wz = pts[-1][0] - dx * 0.025 + dx * 0.05, pts[-1][2] - dz * 0.025 + dz * 0.05
            pts.append((wx + dx * 0.025, yy + (0.004 if k == 0 else 0), wz + dz * 0.025, dx, dz))
        fall_ribbon(unlit, pts, 0.13, 1)
        bx, bz = pts[-1][0] + dx * 0.05, pts[-1][2] + dz * 0.05
        splash(unlit, bx, bz, lower, 0.1 if ny is None else 0.07)
        if ny is None or lower <= LEVEL_Y[BEACH] + 0.001:
            if ny is not None:  # across the beach and into the sea
                ex, ez = bx, bz
                while ground.at(ex + dx * step, ez + dz * step)[0] is not None:
                    ex, ez = ex + dx * step, ez + dz * step
                stream(unlit, bx, bz, ex + dx * 0.05, ez + dz * 0.05, lower + 0.004, width=0.12)
                splash(unlit, ex + dx * 0.1, ez + dz * 0.1, WATER_LEVEL, 0.09)
            return
        x, z, y = bx, bz, lower



# ---------------------------------------------------------------------------------------------------------- lighting bake

# The app's key light (orientation.ts SUN_DIR, world frame), brought into the island's local frame (ISLAND_YAW = π/4).
SUN_WORLD = Vector((-0.2, 0.8, 0.55)).normalized()


def sun_local_blender():
    yaw = -math.pi / 4
    x, y, z = SUN_WORLD
    lx, lz = x * math.cos(yaw) + z * math.sin(yaw), -x * math.sin(yaw) + z * math.cos(yaw)
    return P(lx, y, lz).normalized()


def bake_attribute(ob, kind, name, samples):
    me = ob.data
    attr = me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    scene = bpy.context.scene
    scene.cycles.samples = samples
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.bake(type=kind, target='VERTEX_COLORS')
    return [tuple(d.color) for d in me.color_attributes[name].data]


def bake_lighting(ob, strength=1.0):
    """Bakes ambient occlusion and the sun's cast shadows into the vertex colours, so the island keeps soft contact
    shading and tree shadows under the app's single toon material."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.world = bpy.data.worlds.new('bakeWorld')
    scene.world.light_settings.distance = 0.35
    mat = bpy.data.materials.new('bake')
    mat.use_nodes = True
    ob.data.materials.append(mat)
    for o in bpy.data.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    ao = bake_attribute(ob, 'AO', 'AO', 48)
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.angle = math.radians(4)
    sun_ob = bpy.data.objects.new('sun', sun)
    scene.collection.objects.link(sun_ob)
    sun_ob.rotation_euler = sun_local_blender().to_track_quat('Z', 'Y').to_euler()
    shadow = bake_attribute(ob, 'SHADOW', 'Shadow', 24)
    me = ob.data
    base = me.color_attributes['Col'].data
    for i, d in enumerate(base):
        a = ao[i][0]
        sh = shadow[i][0]
        k = 1 - strength * (1 - (0.3 + 0.7 * a) * (0.62 + 0.38 * sh))
        c = d.color
        d.color = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    for name in ('AO', 'Shadow'):
        me.color_attributes.remove(me.color_attributes[name])
    me.color_attributes.active_color = me.color_attributes['Col']
    me.materials.clear()
    bpy.data.objects.remove(sun_ob)


def finish(terrain, sink, unlit_sink):
    """Joins everything into the Lit, Soft and Unlit meshes, bakes their lighting and exports OUT."""
    soft = to_object(sink.soft, 'Soft')
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
    bake_lighting(bpy.data.objects['Lit'])
    if soft.data.polygons:
        bake_lighting(soft, strength=0.6)
    for ob in bpy.data.objects:
        ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_materials='NONE', export_yup=True)
    print('triangles', {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects})
