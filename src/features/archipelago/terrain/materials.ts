import { DataTexture, MeshBasicMaterial, MeshLambertMaterial, MeshToonMaterial, NearestFilter, RedFormat } from 'three'
import type { Material } from 'three'

export type LitMaterialKind = 'toon' | 'lambert'

/** Three-step toon ramp (spec §2.5): shade, mid, lit. */
export function createToonGradient(): DataTexture {
  const texture = new DataTexture(new Uint8Array([120, 190, 255]), 3, 1, RedFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

let gradient: DataTexture | null = null
const lit = new Map<LitMaterialKind, Material>()
const prop = new Map<LitMaterialKind, Material>()

function makeLit(kind: LitMaterialKind): Material {
  if (kind === 'lambert') return new MeshLambertMaterial({ vertexColors: true })
  gradient ??= createToonGradient()
  return new MeshToonMaterial({ vertexColors: true, gradientMap: gradient })
}

/** One shared lit material per kind for every island's terrain: no per-island clones (spec §8). */
export function getTerrainLitMaterial(kind: LitMaterialKind = 'toon'): Material {
  let m = lit.get(kind)
  if (!m) {
    m = makeLit(kind)
    lit.set(kind, m)
  }
  return m
}

export function getPropMaterial(kind: LitMaterialKind = 'toon'): Material {
  let m = prop.get(kind)
  if (!m) {
    m = makeLit(kind)
    prop.set(kind, m)
  }
  return m
}

/** Foam, shallows, pools and falls: authored colours, unaffected by light or tone mapping. */
export const terrainUnlitMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

// ---------------------------------------------------------------------------------------------------------------
// Moving parts of the hand-built islands. scripts/blender/island_core.py tags them with a 'flow' texcoord:
//   x = along / FLOW_SPAN (distance along the flow, or height above a flame or plume base),  y = 1 - kind / 8 in the
//   packed glTF (the exporter flips V).
// Untagged vertices read (0, 0) and stay still. HandBuiltIsland aliases the glTF 'uv' attribute as 'flow'.

/** Shared clock for every island's flowing parts; HandBuiltIsland advances it each frame. */
export const flowTime = { value: 0 }

// Blender's glTF exporter flips texcoord V (v' = 1 - v), so the kind is read from 1 - y; untagged vertices land on 0.
const FLOW_DECODE = /* glsl */ `
  float flowKind = mod(floor((1.0 - flow.y) * 8.0 + 0.5), 8.0);
  float flowAlong = flow.x * 8.0;
`

/**
 * Unlit island parts that move: water streaks running downstream (1), lava pulsing hot along its flow (2), flames
 * flickering and wobbling (3), and splashes, vents and lava pools pulsing (5). Offsets are in world units, divided by
 * the node scale that meshopt quantisation puts on the mesh.
 */
export const flowUnlitMaterial = (() => {
  const m = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowTime = flowTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 flow;\nvarying vec2 vFlow;\nuniform float uFlowTime;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFlow = flow;
        ${FLOW_DECODE}
        if (flowKind == 3.0) {
          float scale = length(modelMatrix[0].xyz);
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float tip = clamp(flowAlong * 0.5, 0.0, 1.0);
          transformed.x += sin(uFlowTime * 9.0 + wp.x * 30.0) * 0.008 * tip / scale;
          transformed.z += cos(uFlowTime * 7.3 + wp.z * 30.0) * 0.008 * tip / scale;
          transformed.y += sin(uFlowTime * 11.0 + wp.x * 17.0) * 0.006 * tip / scale;
        }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFlow;\nuniform float uFlowTime;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 flow = vFlow;
          ${FLOW_DECODE}
          if (flowKind == 1.0) {
            float ph = fract(flowAlong * 4.0 - uFlowTime * 1.6);
            float streak = smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.1, 0.35, ph));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), streak * 0.45);
          } else if (flowKind == 2.0) {
            float ph = fract(flowAlong * 2.5 - uFlowTime * 0.45);
            float hot = smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.2, 0.6, ph));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.93, 0.62), hot * 0.5);
            diffuseColor.rgb *= 0.92 + 0.08 * sin(uFlowTime * 2.0 + flowAlong * 3.0);
          } else if (flowKind == 3.0) {
            diffuseColor.rgb *= 0.85 + 0.2 * sin(uFlowTime * 13.0 + flowAlong * 4.0) * sin(uFlowTime * 7.1);
          } else if (flowKind == 5.0) {
            diffuseColor.rgb *= 0.9 + 0.14 * sin(uFlowTime * 2.4 + flowAlong * 5.0);
          }
        }`,
      )
  }
  m.customProgramCacheKey = () => 'cairn-flow-unlit'
  return m
})()

/** Soft island parts that move: smoke and steam (4) sway and bob, more the higher they are above their source. */
export const flowSoftMaterial = (() => {
  const m = new MeshLambertMaterial({ vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowTime = flowTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 flow;\nuniform float uFlowTime;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          ${FLOW_DECODE}
          if (flowKind == 4.0) {
            float scale = length(modelMatrix[0].xyz);
            vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
            float lift = clamp(flowAlong, 0.0, 4.0);
            transformed.x += sin(uFlowTime * 0.9 + wp.y * 3.0 + wp.x * 2.0) * 0.018 * lift / scale;
            transformed.z += cos(uFlowTime * 0.7 + wp.y * 2.5 + wp.z * 2.0) * 0.018 * lift / scale;
            transformed.y += (0.5 + 0.5 * sin(uFlowTime * 0.6 + wp.x * 4.0 + wp.z * 3.0)) * 0.012 * lift / scale;
          }
        }`,
      )
  }
  m.customProgramCacheKey = () => 'cairn-flow-soft'
  return m
})()
