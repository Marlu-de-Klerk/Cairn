import { useEffect, useRef, useState } from 'react'
import type { Biome, IslandLayout } from '../../../lib/island/types'
import { LAYOUT_VERSION } from '../../../lib/island/types'
import { buildIslandLayout } from '../../../lib/island/plan'
import { propRule } from '../../../lib/island/biomes'
import { BufferGeometry } from 'three'
import { buildHull, buildTerrain } from './terraceMesh'
import { hasHandBuiltIsland } from '../../../lib/island/fixedIslands'
import type { IslandDetail, TerrainMeshes } from './terraceMesh'
import { getPropGeometry } from './propGeometry'

export interface IslandBuild extends TerrainMeshes {
  readonly layout: IslandLayout
  readonly detail: IslandDetail
  readonly buildMs: number
  readonly triangles: { readonly lit: number; readonly unlit: number; readonly props: number }
}

const LAYOUT_LIMIT = 48
const BUILD_LIMIT = 24
const layouts = new Map<string, IslandLayout>()
const builds = new Map<string, { build: IslandBuild; refs: number }>()

const layoutKey = (biome: Biome, seed: number) => `v${LAYOUT_VERSION}:${biome}:${seed}`

/** Synchronous and memoised (LRU 48): the one layout every consumer of an island reads. */
export function getIslandLayout(biome: Biome, seed: number): IslandLayout {
  const key = layoutKey(biome, seed)
  let layout = layouts.get(key)
  if (layout) layouts.delete(key)
  else layout = buildIslandLayout(biome, seed)
  layouts.set(key, layout)
  while (layouts.size > LAYOUT_LIMIT) layouts.delete(layouts.keys().next().value!)
  return layout
}

function evict() {
  for (const [key, entry] of builds) {
    if (builds.size <= BUILD_LIMIT) return
    if (entry.refs > 0) continue
    entry.build.lit.dispose()
    entry.build.unlit.dispose()
    entry.build.hull.dispose()
    builds.delete(key)
  }
}

/** Synchronous, memoised (LRU 24) and ref-counted; geometry is disposed only when evicted with no holders. */
export function getIslandBuild(biome: Biome, seed: number, detail: IslandDetail): IslandBuild {
  const key = `${layoutKey(biome, seed)}:${detail}`
  const cached = builds.get(key)
  if (cached) {
    builds.delete(key)
    builds.set(key, cached)
    cached.refs++
    return cached.build
  }
  const t0 = performance.now()
  const layout = getIslandLayout(biome, seed)
  // A hand-built island draws its own model (models/HandBuiltIsland.tsx); only the hull comes from the layout.
  const handBuilt = hasHandBuiltIsland(biome)
  const terrain = handBuilt ? { lit: new BufferGeometry(), unlit: new BufferGeometry(), hull: buildHull(layout) } : buildTerrain(layout, detail)
  let props = 0
  for (const p of handBuilt ? [] : layout.props) {
    if (detail !== 'focus' && !propRule(biome, p.kind)?.overview) continue
    props += getPropGeometry(p.kind, biome).getAttribute('position').count / 3
  }
  const build: IslandBuild = {
    ...terrain,
    layout,
    detail,
    buildMs: performance.now() - t0,
    triangles: { lit: (terrain.lit.getAttribute('position')?.count ?? 0) / 3, unlit: (terrain.unlit.getAttribute('position')?.count ?? 0) / 3, props },
  }
  builds.set(key, { build, refs: 1 })
  evict()
  return build
}

export function releaseIslandBuild(build: IslandBuild): void {
  for (const entry of builds.values()) {
    if (entry.build === build) {
      entry.refs = Math.max(0, entry.refs - 1)
      return
    }
  }
}

type Job = () => void
const queue: Job[] = []
let draining = false

// The timeout bounds the wait: a page that never goes idle (or headless Chrome's virtual time) must still build.
function nextSlot(run: () => void) {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 100 })
  else setTimeout(run, 16)
}

function drain() {
  const job = queue.shift()
  if (!job) {
    draining = false
    return
  }
  job()
  nextSlot(drain)
}

/** One build per idle slot, so ten islands never stall a frame together; the focused island jumps the queue. */
function schedule(priority: 'high' | 'normal', job: Job): () => void {
  if (priority === 'high') queue.unshift(job)
  else queue.push(job)
  if (!draining) {
    draining = true
    nextSlot(drain)
  }
  return () => {
    const i = queue.indexOf(job)
    if (i >= 0) queue.splice(i, 1)
  }
}

/**
 * The only React-aware export. Returns null until the first build lands; when the detail changes the previous build
 * stays on screen until its replacement is ready (spec §3.10), then is released.
 */
export function useIslandBuild(biome: Biome, seed: number, detail: IslandDetail, priority: 'high' | 'normal'): IslandBuild | null {
  const [build, setBuild] = useState<IslandBuild | null>(null)
  const held = useRef<IslandBuild | null>(null)

  useEffect(() => {
    return schedule(priority, () => {
      const next = getIslandBuild(biome, seed, detail)
      if (held.current) releaseIslandBuild(held.current)
      held.current = next
      setBuild(next)
    })
  }, [biome, seed, detail, priority])

  useEffect(
    () => () => {
      if (held.current) releaseIslandBuild(held.current)
      held.current = null
    },
    [],
  )

  return build
}
