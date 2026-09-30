import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, ShaderMaterial, TextureLoader, Vector2, Vector3 } from 'three'
import type { Texture } from 'three'
import { WATER_Y } from '../../lib/island/types'
import { SUN_DIR } from '../../lib/island/orientation'
import { HORIZON_COLOR, SEA_COLOR, SEA_DEEP_COLOR, SEA_RIPPLE_COLOR, SKY_ZENITH_COLOR } from './environmentColors'

/** Island centres the waves calm down around, so each island's own shallow halo meets flat sea at its edge. */
export const MAX_ISLANDS = 32

/** Seamless ocean normal map baked from Blender's FFT Ocean modifier (scripts/blender/water_normals.py). */
export const WATER_NORMALS_URL = '/textures/water-normals.webp'

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uNormals;
  uniform float uHasNormals;
  uniform vec3 uSea;
  uniform vec3 uDeep;
  uniform vec3 uRipple;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  uniform float uExtent;
  uniform vec2 uIslands[${MAX_ISLANDS}];
  uniform int uIslandCount;
  varying vec3 vWorld;

  // Two layers of the ocean normal map drifting in different directions at different scales: their sum never
  // visibly repeats, and reads as moving waves rather than a sliding texture.
  vec3 waveNormal(vec2 p) {
    vec3 a = texture2D(uNormals, p / 24.0 + vec2(uTime * 0.008, uTime * 0.005)).xyz * 2.0 - 1.0;
    vec3 b = texture2D(uNormals, p / 13.0 + vec2(-uTime * 0.006, uTime * 0.01)).xyz * 2.0 - 1.0;
    vec3 n = vec3(a.xy + b.xy * 0.8, a.z * b.z);
    // map tangent space (x, y, z-up) onto the sea plane (x, z, y-up)
    return normalize(vec3(n.x, n.z, n.y));
  }

  void main() {
    vec2 p = vWorld.xz;
    float fromCamera = distance(cameraPosition, vWorld);

    // Calm water right next to each island, so its baked shallow halo meets the sea colour exactly.
    float nearIsland = 1.0;
    for (int i = 0; i < ${MAX_ISLANDS}; i++) {
      if (i >= uIslandCount) break;
      nearIsland = min(nearIsland, smoothstep(3.1, 9.0, distance(p, uIslands[i])));
    }

    // Deep water beyond the archipelago.
    float deep = smoothstep(uExtent + 4.0, uExtent + 55.0, length(p));
    vec3 base = mix(uSea, uDeep, deep * 0.85);

    // Wave detail fades with distance (the texture would alias) and near islands.
    float detail = (1.0 - smoothstep(35.0, 140.0, fromCamera)) * nearIsland * uHasNormals;
    vec3 n = normalize(mix(vec3(0.0, 1.0, 0.0), waveNormal(p), detail * 0.6));
    vec3 view = normalize(cameraPosition - vWorld);

    // Wave faces tilted toward the viewer read a touch lighter, faces away a touch darker.
    float tilt = dot(n.xz, normalize(view.xz + 1e-4));
    vec3 color = base * (1.0 + tilt * 0.6);
    // Steep crests catch a pale highlight.
    float crest = smoothstep(0.1, 0.2, length(n.xz));
    color = mix(color, uRipple, crest * 0.25);

    // Sky reflection, stronger at grazing angles (Schlick), from the pale horizon up to the blue zenith.
    vec3 r = reflect(-view, n);
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, r.y));
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    color = mix(color, sky, fresnel * 0.3);

    // Sun: a broad sheen plus tight sparkles where a wave facet mirrors the sun into the eye.
    vec3 h = normalize(view + uSun);
    float nh = max(dot(n, h), 0.0);
    color += vec3(1.0, 0.97, 0.9) * (pow(nh, 60.0) * 0.18 + pow(nh, 900.0) * 1.6 * detail);

    // Haze into the sky at the horizon.
    color = mix(color, uHorizon, smoothstep(70.0, 360.0, fromCamera));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

interface WaterProps {
  /** radius around the origin that holds every island */
  readonly extent: number
  readonly islands: readonly (readonly [number, number])[]
}

/**
 * The open sea: moving waves from a baked ocean normal map, lit with a sky reflection and sun glints on the app's
 * lagoon colour, deepening beyond the archipelago and hazing into the sky at the horizon. Opaque; foam and the
 * shallow halos sit a few millimetres above it, so polygonOffset pushes it back in depth rather than relying on those
 * tiny height gaps.
 */
export function Water({ extent, islands }: WaterProps) {
  const invalidate = useThree((state) => state.invalidate)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uNormals: { value: null as Texture | null },
          uHasNormals: { value: 0 },
          uSea: { value: new Color(SEA_COLOR) },
          uDeep: { value: new Color(SEA_DEEP_COLOR) },
          uRipple: { value: new Color(SEA_RIPPLE_COLOR) },
          uHorizon: { value: new Color(HORIZON_COLOR) },
          uZenith: { value: new Color(SKY_ZENITH_COLOR) },
          uSun: { value: new Vector3(...SUN_DIR) },
          uExtent: { value: extent },
          uIslands: { value: Array.from({ length: MAX_ISLANDS }, () => new Vector2(1e4, 1e4)) },
          uIslandCount: { value: 0 },
        },
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    [],
  )

  // Loaded without suspending: the sea draws flat until the map arrives, rather than holding up the whole scene.
  useEffect(() => {
    let alive = true
    const texture = new TextureLoader().load(WATER_NORMALS_URL, () => {
      if (!alive) return
      material.uniforms.uHasNormals.value = 1
      invalidate()
    })
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.colorSpace = NoColorSpace
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.anisotropy = 4
    material.uniforms.uNormals.value = texture
    return () => {
      alive = false
      texture.dispose()
    }
  }, [material, invalidate])

  material.uniforms.uExtent.value = extent
  const list = islands.slice(0, MAX_ISLANDS)
  list.forEach(([x, z], i) => (material.uniforms.uIslands.value[i] as Vector2).set(x, z))
  material.uniforms.uIslandCount.value = list.length

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} material={material} raycast={() => null}>
      <circleGeometry args={[600, 96]} />
    </mesh>
  )
}
