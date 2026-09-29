import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Euler, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { Mesh } from 'three'
import type { PropKind } from '../../lib/island/types'
import { propRule } from '../../lib/island/biomes'
import type { IslandBuild } from './terrain/islandCache'
import type { LitMaterialKind } from './terrain/materials'
import { getPropMaterial, getTerrainLitMaterial, terrainUnlitMaterial } from './terrain/materials'
import { getPropGeometry } from './terrain/propGeometry'
import { PropPart } from './models/PropPart'
import type { PropPlacement as PartPlacement } from './models/scatter'
import { useHullRegistry } from './hullRegistry'
import { HandBuiltIsland } from './models/HandBuiltIsland'
import { HAND_BUILT } from '../../lib/island/fixedIslands'

export interface TerracedIslandProps {
  readonly build: IslandBuild
  readonly materialKind?: LitMaterialKind
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void
  readonly onPointerOver?: (event: ThreeEvent<PointerEvent>) => void
  readonly onPointerOut?: (event: ThreeEvent<PointerEvent>) => void
}

// Raycastable and a valid occluder, but never drawn to colour or depth: safer than relying on visible={false}.
const hullMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false })
const UP = new Vector3(0, 1, 0)

/** Lit terrain, unlit water features, one instanced PropPart per prop kind, and the pointer/occlusion hull. */
export function TerracedIsland({ build, materialKind = 'toon', onClick, onPointerOver, onPointerOut }: TerracedIslandProps) {
  const hullRef = useRef<Mesh>(null)
  const { register } = useHullRegistry()
  useEffect(() => (hullRef.current ? register(hullRef.current) : undefined), [register, build])

  const groups = useMemo(() => {
    const byKind = new Map<PropKind, PartPlacement[]>()
    const { biome, props } = build.layout
    for (const p of props) {
      if (build.detail !== 'focus' && !propRule(biome, p.kind)?.overview) continue
      // Lean is a world-frame tilt applied after the yaw, so a palm leans outward whatever its random rotation.
      const q = new Quaternion().setFromEuler(new Euler(p.tiltX, 0, p.tiltZ)).multiply(new Quaternion().setFromAxisAngle(UP, p.rotY))
      const e = new Euler().setFromQuaternion(q, 'XYZ')
      const list = byKind.get(p.kind) ?? []
      list.push({ position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z], scale: p.scale })
      byKind.set(p.kind, list)
    }
    return [...byKind]
  }, [build])

  const handBuilt = HAND_BUILT[build.layout.biome]
  return (
    <group>
      {handBuilt ? (
        <HandBuiltIsland url={handBuilt.url} litMaterial={getTerrainLitMaterial(materialKind)} softMaterial={getTerrainLitMaterial('lambert')} unlitMaterial={terrainUnlitMaterial} />
      ) : (
        <>
          <mesh geometry={build.lit} material={getTerrainLitMaterial(materialKind)} raycast={() => null} />
          <mesh geometry={build.unlit} material={terrainUnlitMaterial} raycast={() => null} />
        </>
      )}
      <mesh ref={hullRef} geometry={build.hull} material={hullMaterial} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} />
      {handBuilt ? null : groups.map(([kind, placements]) => (
        <PropPart key={kind} geometry={getPropGeometry(kind, build.layout.biome)} material={getPropMaterial(materialKind)} placements={placements} />
      ))}
    </group>
  )
}
