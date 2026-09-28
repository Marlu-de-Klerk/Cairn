import type { Goal } from '../../features/archipelago/api'

export type Biome = Goal['biome']
export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
export type Hex = `#${string}`

export const WATER_Y = -0.05
export const LAYOUT_VERSION = 1

export type CompositionPattern = 'massif' | 'knoll' | 'shelves'
export type SummitShape = 'plateau' | 'dome' | 'crater'
export type LevelRole = 'shallow' | 'foam' | 'beach' | 'lawn' | 'tier' | 'summit'

export interface Level {
  readonly index: number
  readonly role: LevelRole
  readonly y: number
  readonly wall: 'none' | 'sand' | 'lip' | 'cliff'
}

export interface PolarBlob {
  readonly cx: number
  readonly cz: number
  readonly radius: number
  readonly harmonics: readonly { n: number; amp: number; phase: number }[]
  readonly lobes: readonly { x: number; z: number; r: number }[]
  readonly flutes: { readonly binsPerRadian: number; readonly depth: number; readonly offsets: Float32Array } | null
}

export interface TrailSample {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly s: number
  readonly level: number
  readonly ramp: number
}

export interface RampSpan {
  readonly fromLevel: number
  readonly toLevel: number
  readonly s0: number
  readonly s1: number
  readonly theta: number
  readonly dir: 1 | -1
}

export interface IslandTrail {
  readonly samples: readonly TrailSample[]
  readonly waypoints: readonly Vec3[]
  readonly ramps: readonly RampSpan[]
  readonly halfWidth: number
  readonly length: number
}

export type PropKind =
  | 'palm' | 'canopyTree' | 'pine' | 'bareTree' | 'ashTree' | 'cactus'
  | 'bush' | 'fernRosette' | 'grassTuft' | 'flower' | 'mushroom' | 'heather' | 'coralPuff' | 'anemone'
  | 'stump' | 'log' | 'heroRock' | 'boulder' | 'waterRock' | 'lily' | 'iceFloe'
  | 'tent' | 'campfire' | 'signpost' | 'summitCairn'

export interface PropPlacement {
  readonly kind: PropKind
  readonly x: number
  readonly y: number
  readonly z: number
  readonly rotY: number
  readonly scale: number
  readonly tiltX: number
  readonly tiltZ: number
}

export interface PillarSpec { readonly x: number; readonly z: number; readonly r: number; readonly baseY: number; readonly topY: number; readonly sides: 6 | 7; readonly grassCap: boolean; readonly rot: number }
export interface VineSpec { readonly x: number; readonly y: number; readonly z: number; readonly rotY: number; readonly length: number }
export interface CaveSpec { readonly x: number; readonly y: number; readonly z: number; readonly rotY: number; readonly width: number; readonly height: number }
export interface WaterRockSpec { readonly x: number; readonly z: number; readonly r: number; readonly height: number; readonly rot: number }
export interface FallSpec { readonly samples: readonly Vec3[]; readonly dir: Vec2; readonly kind: 'water' | 'lava' }
export interface DiscSpec { readonly x: number; readonly z: number; readonly r: number; readonly y: number }

export interface IslandFeatures {
  readonly shelf: { readonly blob: PolarBlob; readonly y: number; readonly baseY: number } | null
  readonly crater: { readonly x: number; readonly z: number; readonly r: number; readonly plugY: number } | null
  readonly pool: (DiscSpec & { readonly kind: 'tide' | 'ember' | 'lagoon' }) | null
  readonly fall: FallSpec | null
  readonly pillars: readonly PillarSpec[]
  readonly vines: readonly VineSpec[]
  readonly caves: readonly CaveSpec[]
  readonly waterRocks: readonly WaterRockSpec[]
  readonly camp: { readonly x: number; readonly y: number; readonly z: number; readonly rotY: number } | null
}

export interface HeightGrid {
  readonly origin: Vec2
  readonly cell: number
  readonly size: number
  readonly heights: Float32Array
}

export interface IslandLayout {
  readonly version: number
  readonly biome: Biome
  readonly seed: number
  readonly pattern: CompositionPattern
  readonly front: number
  readonly side: 1 | -1
  readonly levels: readonly Level[]
  readonly blobs: readonly (PolarBlob | null)[]
  readonly footprintRadius: number
  readonly haloRadius: number
  readonly summit: Vec3
  readonly summitTopY: number
  readonly trail: IslandTrail
  readonly features: IslandFeatures
  readonly props: readonly PropPlacement[]
  readonly heightGrid: HeightGrid
  readonly sdAt: (x: number, z: number) => Float64Array
  readonly levelAt: (x: number, z: number) => number
  readonly terraceY: (x: number, z: number) => number
  readonly groundHeightAt: (x: number, z: number) => number
  readonly pathProject: (x: number, z: number) => { d: number; y: number; s: number }
  readonly walkableRun: (x: number, z: number, dirX: number, dirZ: number, refY: number, maxDist: number) => number
}

/** The slice of a layout that curve.ts needs; keeps roadmap code off the rest of the type. */
export type GroundQuery = Pick<IslandLayout, 'groundHeightAt' | 'walkableRun'>
