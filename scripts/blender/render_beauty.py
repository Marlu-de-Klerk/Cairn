"""Beauty render of a hand-built island with Cycles, for promo shots and READMEs (not used by the app).

  python scripts/blender/render_beauty.py assets-raw/VolcanoIsland.raw.glb out.png [front|back] [samples] [transparent]   (bpy)

`transparent` renders the island alone on a transparent background (no sky, sea or vignette), for artwork that sits
on a page, like the sign-in illustration.

Imports the raw Blender export (before gltf-transform), gives it vertex-colour materials (lit/soft are matte, unlit
emits, with extra punch for hot colours like lava), lights it with the app's sun direction and a soft sky, and
grades it in the compositor: bloom on the emissive glow, a warm lift/gamma/gain and a vignette.
"""

import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
IN = args[0]
OUT = args[1] if len(args) > 1 else '/tmp/beauty.png'
VIEW = args[2] if len(args) > 2 else 'front'
SAMPLES = int(args[3]) if len(args) > 3 else 64
TRANSPARENT = len(args) > 4 and args[4] == 'transparent'


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def vertex_colour_material(name, layer, emissive=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = layer  # the glTF importer renames the exported 'Col' attribute (usually to 'Color')
    if not emissive:
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Roughness'].default_value = 0.85
        links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
        links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        return mat
    # Emission whose strength rises with "hotness" (red well above blue), so lava and flames glow and bloom while
    # water and foam stay flat, like the app's unlit material.
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(attr.outputs['Color'], sep.inputs['Color'])
    hot = nodes.new('ShaderNodeMath')
    hot.operation = 'SUBTRACT'
    links.new(sep.outputs['Red'], hot.inputs[0])
    links.new(sep.outputs['Blue'], hot.inputs[1])
    gain = nodes.new('ShaderNodeMath')
    gain.operation = 'MULTIPLY_ADD'
    gain.use_clamp = False
    links.new(hot.outputs['Value'], gain.inputs[0])
    gain.inputs[1].default_value = 9.0
    gain.inputs[2].default_value = 1.0
    clamp = nodes.new('ShaderNodeMath')
    clamp.operation = 'MAXIMUM'
    links.new(gain.outputs['Value'], clamp.inputs[0])
    clamp.inputs[1].default_value = 1.0
    em = nodes.new('ShaderNodeEmission')
    links.new(attr.outputs['Color'], em.inputs['Color'])
    links.new(clamp.outputs['Value'], em.inputs['Strength'])
    links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


def build_scene():
    clear()
    bpy.ops.import_scene.gltf(filepath=IN)
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.data.color_attributes:
            continue
        layer = ob.data.color_attributes[0].name
        ob.data.materials.clear()
        ob.data.materials.append(vertex_colour_material(ob.name, layer, emissive=ob.name.startswith('Unlit')))
    # the open sea: a big plane just under the island's water rings
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.05))
    sea = bpy.context.active_object
    m = bpy.data.materials.new('sea')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb('#5FB8C2')
    b.inputs['Roughness'].default_value = 0.25
    sea.data.materials.append(m)
    if TRANSPARENT:
        # a cut-out: no sea at all (a shadow catcher's shadow reads as a smudge on a dark page)
        sea.hide_render = True


def light_and_camera():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('sky')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb('#CFE9EE')
    bg.inputs['Strength'].default_value = 0.9
    # the app's key light (orientation.ts SUN_DIR) in the island's frame, y-up converted to Blender z-up
    sun_world = Vector((-0.2, 0.8, 0.55)).normalized()
    yaw = -math.pi / 4
    lx = sun_world.x * math.cos(yaw) + sun_world.z * math.sin(yaw)
    lz = -sun_world.x * math.sin(yaw) + sun_world.z * math.cos(yaw)
    d = Vector((lx, -lz, sun_world.y)).normalized()
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    sun.angle = math.radians(3)
    sun.color = (1.0, 0.96, 0.9)
    sun_ob = bpy.data.objects.new('sun', sun)
    scene.collection.objects.link(sun_ob)
    sun_ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    # camera: three-quarter view from the front (layout +z is Blender -y) or the back
    sgn = 1 if VIEW == 'front' else -1
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 55
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (5.4 * sgn, -10.8 * sgn, 7.4)
    target = Vector((0, 0, 0.9))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = (target - cam.location).length
    cam_data.dof.aperture_fstop = 8.0
    scene.camera = cam


def set_input(node, name, value, attr=None):
    """Blender moved several node options to input sockets in 4.x; set whichever exists."""
    if name in node.inputs:
        node.inputs[name].default_value = value
    elif attr and hasattr(node, attr):
        setattr(node, attr, value)


def compositor():
    scene = bpy.context.scene
    scene.use_nodes = True
    tree = scene.node_tree
    nodes, links = tree.nodes, tree.links
    nodes.clear()
    rl = nodes.new('CompositorNodeRLayers')
    glare = nodes.new('CompositorNodeGlare')
    glare.glare_type = 'FOG_GLOW' if 'FOG_GLOW' in [i.identifier for i in glare.bl_rna.properties['glare_type'].enum_items] else 'BLOOM'
    try:
        glare.quality = 'HIGH'
    except (AttributeError, TypeError):
        pass
    set_input(glare, 'Threshold', 1.0, 'threshold')
    set_input(glare, 'Size', 8, 'size')
    links.new(rl.outputs['Image'], glare.inputs['Image'])
    cb = nodes.new('CompositorNodeColorBalance')
    cb.correction_method = 'LIFT_GAMMA_GAIN'
    cb.lift = (0.97, 0.97, 1.02)
    cb.gamma = (1.0, 0.99, 0.97)
    cb.gain = (1.08, 1.04, 0.98)
    links.new(glare.outputs['Image'], cb.inputs['Image'])
    ellipse = nodes.new('CompositorNodeEllipseMask')
    set_input(ellipse, 'Size', (0.95, 0.95), None)
    if hasattr(ellipse, 'width'):
        ellipse.width, ellipse.height = 0.95, 0.95
    blur = nodes.new('CompositorNodeBlur')
    blur.filter_type = 'GAUSS'
    try:
        blur.size_x, blur.size_y = 250, 250
    except (AttributeError, TypeError):
        set_input(blur, 'Size', (250, 250))
    links.new(ellipse.outputs['Mask'], blur.inputs['Image'])
    vig = nodes.new('CompositorNodeMixRGB')
    vig.blend_type = 'MULTIPLY'
    vig.inputs['Fac'].default_value = 0.35
    links.new(cb.outputs['Image'], vig.inputs[1])
    links.new(blur.outputs['Image'], vig.inputs[2])
    comp = nodes.new('CompositorNodeComposite')
    if TRANSPARENT:
        # no vignette on a cut-out, and the render's own alpha carried through
        links.new(cb.outputs['Image'], comp.inputs['Image'])
        if 'Alpha' in comp.inputs:
            links.new(rl.outputs['Alpha'], comp.inputs['Alpha'])
    else:
        links.new(vig.outputs['Image'], comp.inputs['Image'])


def render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.image_settings.file_format = 'PNG'
    if TRANSPARENT:
        scene.render.film_transparent = True
        scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print('rendered', OUT)


build_scene()
light_and_camera()
compositor()
render()
