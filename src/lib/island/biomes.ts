import type { Biome, CompositionPattern, Hex, PropKind, SummitShape } from './types'

export interface TierRecipe {
  readonly y: number
  /** blob radius / radius of the blob one level down (the beach blob for the first tier) */
  readonly radiusRatio: number
  /** centre offset from the tier below along `drift` */
  readonly drift: number
  readonly ledge: { readonly back: number; readonly front: number }
  readonly harmonicAmp: number
}

export interface PropRule {
  readonly kind: PropKind
  readonly count: number
  readonly key?: boolean
  readonly levels: readonly ('beach' | 'lawn' | 'tier' | 'summit' | 'water')[]
  readonly spacing: number
  readonly pathClear: number
  readonly edge?: readonly [number, number]
  readonly cliffFoot?: readonly [number, number]
  readonly facing?: 'front' | 'back' | 'any'
  readonly scale: readonly [number, number]
  readonly height: number
  readonly tilt?: number
  readonly overview: boolean
}

export interface TerrainPalette {
  readonly lawn: Hex; readonly cap: Hex; readonly capLight: Hex; readonly capDark: Hex; readonly lip: Hex
  readonly cliff: Hex; readonly cliffLit: Hex; readonly cliffShade: Hex; readonly cliffRim: Hex; readonly cliffBase: Hex; readonly crevice: Hex
  readonly path: Hex; readonly pathEdge: Hex; readonly tread: Hex; readonly pillar: Hex; readonly pillarCap: Hex
  readonly pool: Hex | null; readonly fall: Hex | null; readonly fallStreak: Hex | null
  readonly foliage: Readonly<Record<string, Hex>>
}

export interface BiomeTerrainConfig {
  readonly pattern: CompositionPattern
  readonly beach: { readonly radius: readonly [number, number]; readonly width: { readonly back: number; readonly front: number }; readonly harmonicAmp: number; readonly spit: boolean }
  readonly lawnY: number
  readonly tiers: readonly TierRecipe[]
  readonly summit: { readonly shape: SummitShape; readonly domeHeight?: number; readonly domeRadius?: number; readonly craterRadius?: number; readonly plugY?: number }
  readonly cliff: { readonly binsPerRadian: number; readonly fluteDepth: number; readonly slabChance: number; readonly lean: number; readonly baseBand: readonly [number, number] }
  readonly features: {
    readonly shelf?: { readonly y: number; readonly radius: number }
    readonly fall?: 'water' | 'lava'
    readonly pool?: 'tide' | 'ember' | 'lagoon'
    readonly cave: boolean
    readonly pillars: number
    readonly vines: number
    readonly waterRocks: number
    readonly camp: boolean
  }
  readonly props: readonly PropRule[]
  readonly palette: TerrainPalette
  readonly previewSeed: number
}

export const SHARED_PALETTE = {
  water: '#6BC2C9', shallow: '#8FD4D9', foam: '#FFFFFF', foamEdge: '#DDF3F4',
  sand: '#EFCB8E', sandWall: '#DDB677', trailDone: '#3A7D77',
  cairnPending: '#CFC8BA', cairnNext: '#F6A9A0', cairnDone: '#5FBFA8',
  pennantFlag: '#F6A9A0', pennantPole: '#FFF4DA', entry: '#FFF4DA',
} as const

const PRESET = { shallowY: -0.042, foamY: -0.036, beachY: 0.04 } as const
export const PATTERN_PRESETS: Record<CompositionPattern, typeof PRESET> = { massif: PRESET, knoll: PRESET, shelves: PRESET }

// Landmarks are placed by scatter.ts's landmark pass, not by rejection sampling; their rules only carry size.
const LANDMARKS: readonly PropRule[] = [
  { kind: 'signpost', count: 1, levels: ['beach', 'lawn'], spacing: 0.3, pathClear: 0.05, scale: [1, 1], height: 0.34, overview: true },
  { kind: 'summitCairn', count: 1, levels: ['summit'], spacing: 0.3, pathClear: 0, scale: [1, 1], height: 0.3, overview: true },
  { kind: 'tent', count: 1, levels: ['lawn', 'tier'], spacing: 0.4, pathClear: 0.1, scale: [1, 1], height: 0.2, overview: true },
  { kind: 'campfire', count: 1, levels: ['lawn', 'tier'], spacing: 0.2, pathClear: 0.1, scale: [1, 1], height: 0.06, overview: false },
]

function stubProps(tall: PropKind, cover: PropKind): readonly PropRule[] {
  return [
    ...LANDMARKS,
    { kind: tall, count: 8, key: true, levels: ['lawn', 'tier', 'summit'], spacing: 0.5, pathClear: 0.28, edge: [0.1, 9], scale: [0.85, 1.15], height: 0.5, overview: true },
    { kind: cover, count: 8, levels: ['lawn', 'tier', 'summit'], spacing: 0.3, pathClear: 0.08, edge: [0.12, 9], scale: [0.85, 1.15], height: 0.12, overview: false },
  ]
}

function palette(p: Omit<TerrainPalette, 'foliage'>, foliage: Record<string, Hex>): TerrainPalette {
  return { ...p, foliage }
}

const JUNGLE_PROPS: readonly PropRule[] = [
  ...LANDMARKS,
  { kind: 'stump', count: 1, levels: ['summit'], spacing: 0.4, pathClear: 0.2, scale: [1, 1], height: 0.16, overview: true },
  { kind: 'heroRock', count: 1, levels: ['lawn'], spacing: 0.7, pathClear: 0.25, scale: [1, 1], height: 0.36, overview: true },
  { kind: 'palm', count: 6, key: true, levels: ['lawn', 'tier', 'summit'], spacing: 0.6, pathClear: 0.3, edge: [0.1, 0.45], scale: [0.82, 1.17], height: 0.68, tilt: 0.24, overview: true },
  { kind: 'canopyTree', count: 16, levels: ['lawn', 'tier', 'summit'], spacing: 0.32, pathClear: 0.28, edge: [0.06, 9], facing: 'back', scale: [0.8, 1.2], height: 0.58, overview: true },
  { kind: 'bush', count: 12, key: true, levels: ['lawn', 'tier'], spacing: 0.26, pathClear: 0.12, cliffFoot: [0.1, 0.55], scale: [0.78, 1.22], height: 0.2, overview: true },
  { kind: 'log', count: 1, levels: ['lawn'], spacing: 0.6, pathClear: 0.25, edge: [0.3, 9], scale: [0.9, 1.1], height: 0.1, overview: true },
  { kind: 'fernRosette', count: 12, levels: ['lawn', 'tier', 'summit'], spacing: 0.5, pathClear: 0.1, edge: [0.2, 9], scale: [0.85, 1.15], height: 0.08, overview: false },
  { kind: 'flower', count: 8, levels: ['lawn', 'tier'], spacing: 0.25, pathClear: 0.06, edge: [0.15, 9], scale: [0.85, 1.15], height: 0.12, overview: false },
  { kind: 'mushroom', count: 3, levels: ['lawn', 'tier'], spacing: 0.3, pathClear: 0.1, cliffFoot: [0.12, 0.35], scale: [0.85, 1.15], height: 0.1, overview: false },
  { kind: 'grassTuft', count: 10, levels: ['lawn', 'tier', 'summit'], spacing: 0.3, pathClear: 0.04, edge: [0.1, 9], scale: [0.8, 1.2], height: 0.1, overview: false },
  { kind: 'lily', count: 3, levels: ['water'], spacing: 0.4, pathClear: 0.3, scale: [0.9, 1.2], height: 0.02, overview: false },
]

const CLIFF_DEFAULT = { baseBand: [0.26, 0.4] as const }

// The five non-jungle biomes reuse the jungle terrain recipe until the next plan tunes their own patterns (spec §11 Phase 6).
const JUNGLE_TERRAIN = {
    pattern: 'massif',
    beach: { radius: [2.45, 2.65], width: { back: 0.16, front: 0.5 }, harmonicAmp: 0.1, spit: true },
    lawnY: 0.16,
    tiers: [
      { y: 1.1, radiusRatio: 0.74, drift: 0.62, ledge: { back: 0.28, front: 0.9 }, harmonicAmp: 0.09 },
      { y: 2.1, radiusRatio: 0.7, drift: 0.5, ledge: { back: 0.3, front: 0.85 }, harmonicAmp: 0.08 },
    ],
    summit: { shape: 'plateau' },
    cliff: { binsPerRadian: 5.5, fluteDepth: 0.035, slabChance: 0.12, lean: 0.06, ...CLIFF_DEFAULT },
    features: { shelf: { y: 1.6, radius: 0.55 }, fall: 'water', pool: 'tide', cave: true, pillars: 4, vines: 8, waterRocks: 5, camp: true },
} as const

export const BIOME_TERRAIN: Record<Biome, BiomeTerrainConfig> = {
  jungle: {
    ...JUNGLE_TERRAIN,
    props: JUNGLE_PROPS,
    palette: palette(
      {
        lawn: '#78C487', cap: '#6FBF84', capLight: '#86CE93', capDark: '#579F6F', lip: '#5E9F6E',
        cliff: '#A8735A', cliffLit: '#B27C61', cliffShade: '#9A6750', cliffRim: '#C08A6C', cliffBase: '#7E5443', crevice: '#5A3B30',
        path: '#D9C08A', pathEdge: '#CDAE78', tread: '#B98452', pillar: '#9C6A52', pillarCap: '#B8836A',
        pool: '#BEE8EA', fall: '#BEE8EA', fallStreak: '#FFFFFF',
      },
      {
        palmTrunk: '#B98452', palmRing: '#A6743F', frond: '#4E8F6E', frondTip: '#7BC98C',
        canopy: '#3F7F86', canopyShade: '#336B73', canopyTop: '#5A9AA0', canopyTrunk: '#8B6B4A',
        bush: '#5FA877', fern: '#4E8F6E', vine: '#4E8F6E', vineLeaf: '#7BC98C',
        flower: '#F6A9A0', flowerCentre: '#FFF4DA', mushroom: '#F6A9A0', mushroomStem: '#FFF4DA',
        stump: '#B98452', stumpInner: '#D9B07A', stumpMoss: '#7BC98C', heroRock: '#A8735A', heroRockMoss: '#9FD27A',
        tent: '#F6A9A0', tentDoor: '#5A3B30', campfireStone: '#CFC8BA', ember: '#F2A25C',
        log: '#B98452', lily: '#5FA877', grass: '#5FA877',
      },
    ),
    previewSeed: 1,
  },
  volcano: {
    ...JUNGLE_TERRAIN,
    props: stubProps('ashTree', 'fernRosette'),
    palette: palette(
      {
        lawn: '#93A78C', cap: '#A4948A', capLight: '#B3A59B', capDark: '#8E7F76', lip: '#86A382',
        cliff: '#7A6259', cliffLit: '#86706A', cliffShade: '#6C574F', cliffRim: '#947D73', cliffBase: '#5C4A42', crevice: '#3F322D',
        path: '#C9B49A', pathEdge: '#B39E86', tread: '#5C4A42', pillar: '#5C4A42', pillarCap: '#7A6259',
        pool: '#F2A25C', fall: '#F2A25C', fallStreak: '#F7C08A',
      },
      { ashTree: '#5C4A42', ashCanopy: '#6F8F6A', fern: '#6F8F6A', boulder: '#6C574F' },
    ),
    previewSeed: 1,
  },
  desert: {
    ...JUNGLE_TERRAIN,
    // The hand-built desert has no waterfall or vines; its oasis sits on the lawn pool's spot.
    features: { shelf: JUNGLE_TERRAIN.features.shelf, pool: 'lagoon', cave: true, pillars: 4, vines: 0, waterRocks: 5, camp: true },
    props: stubProps('cactus', 'bush'),
    palette: palette(
      {
        lawn: '#E8C893', cap: '#E3C088', capLight: '#EBCD9C', capDark: '#D6AF74', lip: '#C9A56A',
        cliff: '#D39A6A', cliffLit: '#DDA878', cliffShade: '#C08858', cliffRim: '#E6B488', cliffBase: '#A8704A', crevice: '#7E4F33',
        path: '#F0DDB4', pathEdge: '#D9BE8C', tread: '#B98452', pillar: '#CC9160', pillarCap: '#E3C088',
        pool: null, fall: null, fallStreak: null,
      },
      { palmCrown: '#8FA95C', palmTrunk: '#B98452', cactus: '#7FA36A', bush: '#A7B86E', flower: '#F6A9A0' },
    ),
    previewSeed: 1,
  },
  tundra: {
    ...JUNGLE_TERRAIN,
    props: stubProps('pine', 'bush'),
    palette: palette(
      {
        lawn: '#E8F1F3', cap: '#F4FAFB', capLight: '#FFFFFF', capDark: '#D3E3E6', lip: '#C9DCDE',
        cliff: '#8F9EA3', cliffLit: '#A2AFB3', cliffShade: '#7F8D92', cliffRim: '#B7C3C6', cliffBase: '#66747A', crevice: '#4B565B',
        path: '#C8B9A6', pathEdge: '#B3A38F', tread: '#8B7362', pillar: '#8F9EA3', pillarCap: '#F4FAFB',
        pool: null, fall: null, fallStreak: null,
      },
      { pine: '#5E8C7E', pineShade: '#4F7A6E', bark: '#8B7362', canopy: '#C9DCDE', bush: '#A9C4C0', floe: '#F4FAFB' },
    ),
    previewSeed: 1,
  },
  reef: {
    ...JUNGLE_TERRAIN,
    props: stubProps('palm', 'coralPuff'),
    palette: palette(
      {
        lawn: '#F4DDAE', cap: '#F4DDAE', capLight: '#F8E7C4', capDark: '#E8CC96', lip: '#9ED6B4',
        cliff: '#E2B596', cliffLit: '#EAC2A5', cliffShade: '#D3A284', cliffRim: '#F0CFB5', cliffBase: '#B98A70', crevice: '#8E6552',
        path: '#FFF1D6', pathEdge: '#E6CFA2', tread: '#C9957A', pillar: '#E2B596', pillarCap: '#F4DDAE',
        pool: '#8FD4D9', fall: null, fallStreak: null,
      },
      { frond: '#5FA877', coral: '#F6A9A0', coralAlt: '#F4B98C', anemone: '#5FBFA8', seagrass: '#9ED6B4' },
    ),
    previewSeed: 1,
  },
  highlands: {
    ...JUNGLE_TERRAIN,
    props: stubProps('pine', 'heather'),
    palette: palette(
      {
        lawn: '#A6BC92', cap: '#9DB58A', capLight: '#AFC49C', capDark: '#879F76', lip: '#7F9A6C',
        cliff: '#A39C8E', cliffLit: '#B3AC9E', cliffShade: '#8E877A', cliffRim: '#C7BFAE', cliffBase: '#6F695F', crevice: '#524D46',
        path: '#D8CCB2', pathEdge: '#C2B599', tread: '#8B7362', pillar: '#8B8FA0', pillarCap: '#C7BFAE',
        pool: null, fall: null, fallStreak: null,
      },
      { heather: '#A98FB0', heatherAlt: '#8B8FA0', pine: '#5E7F6E', bush: '#7F9A6C' },
    ),
    previewSeed: 1,
  },
}

export function isTerraced(biome: Biome): boolean {
  return biome === 'jungle' || biome === 'desert'
}

export function propRule(biome: Biome, kind: PropKind): PropRule | undefined {
  return BIOME_TERRAIN[biome].props.find((rule) => rule.kind === kind)
}
