// Overview camera framing: where the idle orbit looks and how far back it sits so every island is on screen.
// Pure maths; CameraRig owns the camera.

export interface OverviewFrameOptions {
  readonly fovDeg: number
  readonly viewportPx: { readonly width: number; readonly height: number }
  /** Screen pixels covered at the top (the header, plus room for the labels above the farthest islands). */
  readonly insetTopPx: number
}

export interface OverviewFrame {
  /** World x, z the orbit circles and looks at. */
  readonly center: readonly [number, number]
  readonly distance: number
  /** Orbit elevation, radians above the horizon. */
  readonly elevation: number
}

const LANDSCAPE_ELEVATION = (35 * Math.PI) / 180 // spec §6.1: "looking down at maybe 35°"
const PORTRAIT_ELEVATION = (55 * Math.PI) / 180

/**
 * Landscape screens look down at 35°. A portrait screen has height to spare and fits the archipelago by its width,
 * so it looks down more steeply (up to 55° by a 9:20 phone), spreading the islands over more of the screen.
 */
export function overviewElevation(aspect: number): number {
  const t = Math.min(1, Math.max(0, (1 - aspect) / 0.55))
  return LANDSCAPE_ELEVATION + (PORTRAIT_ELEVATION - LANDSCAPE_ELEVATION) * t
}

/** An island's reach from its centre, surf included, and its height, label anchor included. */
export const OVERVIEW_ISLAND_RADIUS = 3.6
export const OVERVIEW_ISLAND_HEIGHT = 2.8
/** An empty archipelago frames a patch of sea this size. */
const EMPTY_RADIUS = 8
export const OVERVIEW_DISTANCE = { min: 16, max: 160 } as const
const NDC_LIMIT = 0.92
const RIM_SAMPLES = 48

type V = [number, number, number]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * The orbit rotates, so the archipelago is framed as the disc around its islands, which looks the same from every
 * azimuth: centred on the islands' bounding box, radius out to the farthest island's edge. The distance is the
 * nearest at which that disc's rim, at sea level and at island height, projects inside ±0.92 NDC horizontally and
 * between -0.92 and the top inset vertically, clamped to OVERVIEW_DISTANCE. A portrait phone screen is narrow, so it
 * sits farther back than a landscape one.
 */
export function overviewFrame(islands: readonly (readonly [number, number])[], options: OverviewFrameOptions): OverviewFrame {
  let center: [number, number] = [0, 0]
  let radius = EMPTY_RADIUS
  if (islands.length > 0) {
    const xs = islands.map((p) => p[0])
    const zs = islands.map((p) => p[1])
    center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
    radius = Math.max(...islands.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1]))) + OVERVIEW_ISLAND_RADIUS
  }
  const elevation = overviewElevation(options.viewportPx.width / Math.max(1, options.viewportPx.height))
  const fits = (distance: number) => rimFits(radius, distance, elevation, options)
  let lo: number = OVERVIEW_DISTANCE.min
  let hi: number = OVERVIEW_DISTANCE.max
  if (fits(lo)) return { center, distance: lo, elevation }
  if (!fits(hi)) return { center, distance: hi, elevation }
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  return { center, distance: hi, elevation }
}

function rimFits(radius: number, distance: number, elevation: number, options: OverviewFrameOptions): boolean {
  const aspect = options.viewportPx.width / Math.max(1, options.viewportPx.height)
  const tanHalf = Math.tan((options.fovDeg * Math.PI) / 360)
  const topLimit = Math.min(NDC_LIMIT, 1 - (2 * options.insetTopPx) / Math.max(1, options.viewportPx.height))
  // Camera on the +X side of the centre (the disc is symmetric, so any azimuth will do), looking at the centre.
  const eye: V = [distance * Math.cos(elevation), distance * Math.sin(elevation), 0]
  const forward: V = [-Math.cos(elevation), -Math.sin(elevation), 0]
  const right: V = [0, 0, -1]
  const up: V = [-Math.sin(elevation), Math.cos(elevation), 0]
  for (let i = 0; i < RIM_SAMPLES; i++) {
    const a = (i / RIM_SAMPLES) * Math.PI * 2
    for (const y of [0, OVERVIEW_ISLAND_HEIGHT]) {
      const v: V = [radius * Math.cos(a) - eye[0], y - eye[1], radius * Math.sin(a) - eye[2]]
      const depth = dot(v, forward)
      if (depth <= 0.1) return false
      const x = dot(v, right) / (depth * tanHalf * aspect)
      const ndcY = dot(v, up) / (depth * tanHalf)
      if (Math.abs(x) > NDC_LIMIT || ndcY > topLimit || ndcY < -NDC_LIMIT) return false
    }
  }
  return true
}
