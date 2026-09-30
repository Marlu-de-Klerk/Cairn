import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, ShaderMaterial, Vector2, Vector3 } from 'three'
import { WATER_Y } from '../../lib/island/types'
import { SUN_DIR } from '../../lib/island/orientation'
import { HORIZON_COLOR, SEA_COLOR, SEA_DEEP_COLOR, SEA_RIPPLE_COLOR } from './environmentColors'

/** Island centres the ripples stay off, so each island's own shallow halo meets flat sea at its edge. */
export const MAX_ISLANDS = 32

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
  uniform vec3 uSea;
  uniform vec3 uDeep;
  uniform vec3 uRipple;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform float uExtent;
  uniform vec2 uIslands[${MAX_ISLANDS}];
  uniform int uIslandCount;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 p = vWorld.xz;
    float fromCamera = distance(cameraPosition, vWorld);

    // How far from the nearest island's halo: ripples and sparkles fade out before they reach it.
    float nearIsland = 1.0;
    for (int i = 0; i < ${MAX_ISLANDS}; i++) {
      if (i >= uIslandCount) break;
      nearIsland = min(nearIsland, smoothstep(3.4, 5.5, distance(p, uIslands[i])));
    }

    // Deep water beyond the archipelago.
    float deep = smoothstep(uExtent + 4.0, uExtent + 55.0, length(p));
    vec3 color = mix(uSea, uDeep, deep * 0.85);

    // Thin, broken wave lines drifting across the sea: a warped sine field gives long crests, and a slower noise
    // breaks them into short dashes. Thinned out with distance so the horizon stays calm.
    float warp = noise(p * 0.15 + vec2(uTime * 0.04, 0.0)) * 7.0;
    float lines = sin(p.x * 1.6 + p.y * 0.7 + warp + uTime * 0.8);
    float broken = smoothstep(0.55, 0.8, noise(p * 0.45 - vec2(0.0, uTime * 0.12)));
    float crest = smoothstep(0.93, 0.995, lines) * broken;
    float lines2 = sin(p.y * 2.3 - p.x * 0.9 + warp * 1.4 - uTime * 0.6);
    crest = max(crest, smoothstep(0.96, 0.998, lines2) * smoothstep(0.6, 0.85, noise(p * 0.6 + 17.0 + uTime * 0.08)) * 0.7);
    float detail = 1.0 - smoothstep(25.0, 90.0, fromCamera);
    color = mix(color, uRipple, crest * 0.5 * nearIsland * detail);

    // Sun glints: sparse cells that twinkle, stronger where the sea faces the sun from this viewpoint.
    vec2 cell = floor(p * 2.2);
    float seed = hash(cell);
    float twinkle = pow(max(0.0, sin(uTime * (1.5 + seed * 2.5) + seed * 40.0)), 12.0);
    vec2 inCell = fract(p * 2.2) - 0.5;
    float dotShape = 1.0 - smoothstep(0.04, 0.16, length(inCell));
    vec3 view = normalize(vWorld - cameraPosition);
    float facing = pow(max(0.0, dot(reflect(view, vec3(0.0, 1.0, 0.0)), uSun)), 6.0);
    float glint = step(0.93, seed) * twinkle * dotShape * nearIsland * detail * (0.35 + facing);
    color = mix(color, vec3(1.0), clamp(glint, 0.0, 1.0));

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
 * The open sea: animated ripples and sun glints on the app's lagoon colour, deepening beyond the archipelago and
 * hazing into the sky at the horizon. Opaque and unlit, like before; foam and the shallow halos sit a few
 * millimetres above it, so polygonOffset pushes it back in depth rather than relying on those tiny height gaps.
 */
export function Water({ extent, islands }: WaterProps) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSea: { value: new Color(SEA_COLOR) },
          uDeep: { value: new Color(SEA_DEEP_COLOR) },
          uRipple: { value: new Color(SEA_RIPPLE_COLOR) },
          uHorizon: { value: new Color(HORIZON_COLOR) },
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
  material.uniforms.uExtent.value = extent
  const list = islands.slice(0, MAX_ISLANDS)
  list.forEach(([x, z], i) => (material.uniforms.uIslands.value[i] as Vector2).set(x, z))
  material.uniforms.uIslandCount.value = list.length

  // Under the focused view's demand frameloop this only advances when something else requests a frame, so the
  // detail view stays still (CLAUDE.md: frameloop="demand" there) while the overview animates.
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} material={material} raycast={() => null}>
      <circleGeometry args={[600, 96]} />
    </mesh>
  )
}
