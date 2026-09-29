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
