import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import type { IslandLayout } from '../../lib/island/types'
import { shoreline } from '../../lib/island/shoreline'

/** How far the surf reaches out from the waterline, and how far it tucks under the beach wall. */
const REACH = 0.75
const TUCK = 0.03
const ROWS = 6
/** Just above the baked shallow and foam halos (y -0.042 / -0.036), below the beach top (0.04). */
const SURF_Y = -0.028

const vertexShader = /* glsl */ `
  attribute vec2 surf;
  varying vec2 vSurf;
  void main() {
    vSurf = surf;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPerimeter;
  varying vec2 vSurf; // x: arc length along the shore, y: 0 at the waterline .. 1 at the outer edge

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // noise that wraps around the island, so there's no seam where the arc length restarts
  float loopNoise(float s, float t) {
    float a = s / uPerimeter * 6.2831853;
    float k = uPerimeter / 6.2831853;
    return noise(vec2(cos(a) * k * 1.4 + t, sin(a) * k * 1.4 - t * 0.7));
  }

  void main() {
    float s = vSurf.x;
    float v = vSurf.y;

    // Wave lines roll in toward the shore; each is broken into lengths and bent a little by noise.
    float phase = fract(v * 2.2 + uTime * 0.22 + (loopNoise(s, 0.0) - 0.5) * 0.35);
    float line = smoothstep(0.0, 0.06, phase) * (1.0 - smoothstep(0.06, 0.2, phase));
    float broken = smoothstep(0.25, 0.55, loopNoise(s * 1.3, uTime * 0.15 + floor(v * 2.2 + uTime * 0.22)));
    float fade = smoothstep(0.04, 0.2, v) * (1.0 - smoothstep(0.55, 1.0, v));
    float waves = line * broken * fade * 0.9;

    // Foam lapping at the waterline: a band that surges up and draws back, uneven along the shore.
    float surge = 0.07 + 0.05 * sin(uTime * 1.1 + s * 0.9) + 0.04 * loopNoise(s, uTime * 0.2);
    float lap = (1.0 - smoothstep(surge * 0.6, surge, v)) * (0.65 + 0.35 * loopNoise(s * 3.0, uTime * 0.4));

    float alpha = max(waves, lap);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`

function surfGeometry(layout: IslandLayout): { geometry: BufferGeometry; perimeter: number } {
  const shore = shoreline(layout, 192)
  const n = shore.length
  const last = shore[n - 1]
  const perimeter = last.s + Math.hypot(shore[0].x - last.x, shore[0].z - last.z)
  const cols = n + 1 // repeat the first column at the end so arc length runs 0..perimeter without a wrap seam
  const positions = new Float32Array(cols * ROWS * 3)
  const surf = new Float32Array(cols * ROWS * 2)
  for (let c = 0; c < cols; c++) {
    const p = shore[c % n]
    const s = c === n ? perimeter : p.s
    for (let r = 0; r < ROWS; r++) {
      const v = r / (ROWS - 1)
      const d = -TUCK + v * (REACH + TUCK)
      const k = (c * ROWS + r) * 3
      positions[k] = p.x + p.nx * d
      positions[k + 1] = SURF_Y
      positions[k + 2] = p.z + p.nz * d
      surf.set([s, Math.max(0, d) / REACH], (c * ROWS + r) * 2)
    }
  }
  const index: number[] = []
  for (let c = 0; c < cols - 1; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const a = c * ROWS + r
      const b = (c + 1) * ROWS + r
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('surf', new BufferAttribute(surf, 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return { geometry, perimeter }
}

/**
 * Surf around an island's beach, in the island's layout frame: lines of foam rolling in toward the shore and foam
 * lapping at the waterline. Transparent and unlit, drawn just above the island's baked shallow halo.
 */
export function ShoreWaves({ layout }: { layout: IslandLayout }) {
  const { geometry, perimeter } = useMemo(() => surfGeometry(layout), [layout])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTime: { value: 0 }, uPerimeter: { value: perimeter } },
        transparent: true,
        depthWrite: false,
      }),
    [perimeter],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
  })
  return <mesh geometry={geometry} material={material} renderOrder={1} raycast={() => null} />
}
