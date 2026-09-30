"""Bakes a seamless ocean normal map for the app's sea (public/textures/water-normals.webp) with Blender's Ocean modifier.

  python scripts/blender/water_normals.py public/textures/water-normals.webp [size]   (bpy module; Pillow for WebP)

The Ocean modifier is an FFT ocean simulation, so its displacement is periodic over `spatial_size`: sampling one
period on a grid gives a height field that tiles. Normals come from central differences with wrap-around, encoded
as a tangent-space normal map (RGB = normal * 0.5 + 0.5, z up), the format three.js normal maps use.
"""

import math
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = args[0] if args else 'public/textures/water-normals.webp'
N = int(args[1]) if len(args) > 1 else 512
PERIOD = 40.0  # metres covered by one tile; the shader decides how large that is in the app

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_plane_add(size=2)
ob = bpy.context.active_object
m = ob.modifiers.new('ocean', 'OCEAN')
m.geometry_mode = 'GENERATE'
m.resolution = 16  # FFT grid for renders
if hasattr(m, 'viewport_resolution'):
    m.viewport_resolution = 16  # background evaluation uses the viewport grid
m.spatial_size = int(PERIOD)
m.repeat_x = m.repeat_y = 1
m.wave_scale = 1.0
m.choppiness = 0.0  # pure height field: no horizontal displacement, so samples stay on their grid
m.wind_velocity = 9.0
m.wave_alignment = 0.35
m.wave_direction = math.radians(30)
m.damping = 0.5
m.random_seed = 7
m.spectrum = 'PHILLIPS'
m.time = 3.0

dg = bpy.context.evaluated_depsgraph_get()
me = ob.evaluated_get(dg).to_mesh()
verts = me.vertices
xs = [v.co.x for v in verts]
ys = [v.co.y for v in verts]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
print('ocean mesh', len(verts), 'verts over', round(x1 - x0, 2), 'x', round(y1 - y0, 2))

# The generated mesh is a regular (G+1) x (G+1) grid over one period whose last row and column repeat the first.
# Read it into a G x G periodic height grid, then resample to N x N with bicubic (Catmull-Rom) interpolation, which
# wraps at the edges, so the map is smooth and tiles seamlessly.
G = round(math.sqrt(len(verts))) - 1
grid = [[0.0] * G for _ in range(G)]
for v in verts:
    i = round((v.co.x - x0) / (x1 - x0) * G)
    j = round((v.co.y - y0) / (y1 - y0) * G)
    if i < G and j < G:
        grid[j][i] = v.co.z
ob.evaluated_get(dg).to_mesh_clear()


def cubic(p0, p1, p2, p3, t):
    return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))


def sample(u, v):
    x, y = u * G, v * G
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    rows = []
    for dj in (-1, 0, 1, 2):
        r = grid[(iy + dj) % G]
        rows.append(cubic(r[(ix - 1) % G], r[ix % G], r[(ix + 1) % G], r[(ix + 2) % G], fx))
    return cubic(rows[0], rows[1], rows[2], rows[3], fy)


h = [[sample(i / N, j / N) for i in range(N)] for j in range(N)]
print('grid', G, 'x', G, 'height range', round(min(map(min, grid)), 3), round(max(map(max, grid)), 3))

cell = PERIOD / N
strength = 1.6  # exaggerate the slopes a little: the app views the sea from far away
pixels = []
for j in range(N):
    for i in range(N):
        dx = (h[j][(i + 1) % N] - h[j][(i - 1) % N]) / (2 * cell) * strength
        dy = (h[(j + 1) % N][i] - h[(j - 1) % N][i]) / (2 * cell) * strength
        nx, ny, nz = -dx, -dy, 1.0
        ln = math.sqrt(nx * nx + ny * ny + nz * nz)
        pixels += [nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5, 1.0]

# Lossy WebP at q90 keeps the normals accurate enough at a tenth of the PNG's size (~46 KB vs ~440 KB).
png = OUT.rsplit('.', 1)[0] + '.png'
img = bpy.data.images.new('water_normals', N, N, alpha=False, float_buffer=False)
img.colorspace_settings.name = 'Non-Color'
img.pixels = pixels
img.filepath_raw = png
img.file_format = 'PNG'
img.save()
if OUT.endswith('.webp'):
    import os
    from PIL import Image
    Image.open(png).convert('RGB').save(OUT, 'WEBP', quality=90, method=6)
    os.remove(png)
print('saved', OUT)
