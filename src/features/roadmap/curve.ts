// src/features/roadmap/curve.ts
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three'
import type { Curve } from 'three'
import type { GroundQuery, Vec3 } from '../../lib/island/types'

export const TRAIL_CLEARANCE = 0.02
const RESAMPLE_SPACING = 0.12
const RIBBON_STEP = 0.03
const MIN_SIDE_ROOM = 0.08

/**
 * The 3D trail from the layout's ground waypoints (trailhead t=0 → summit t=1): resampled every RESAMPLE_SPACING,
 * lifted by `clearance`, centripetal so flat→ramp corners don't overshoot, with enough arc-length divisions that
 * getPointAt(n/(N+1)) is genuinely even by walking distance.
 */
export function buildTrailCurve(waypoints: readonly Vec3[], clearance = TRAIL_CLEARANCE): CatmullRomCurve3 {
  const points: Vector3[] = [new Vector3(waypoints[0][0], waypoints[0][1] + clearance, waypoints[0][2])]
  let since = 0
  for (let i = 1; i < waypoints.length; i++) {
    const [x, y, z] = waypoints[i]
    const [px, , pz] = waypoints[i - 1]
    since += Math.hypot(x - px, z - pz)
    if (since >= RESAMPLE_SPACING || i === waypoints.length - 1) {
      points.push(new Vector3(x, y + clearance, z))
      since = 0
    }
  }
  const curve = new CatmullRomCurve3(points, false, 'centripetal')
  curve.arcLengthDivisions = Math.max(2000, points.length * 8)
  curve.updateArcLengths()
  return curve
}

/** Arc-length-parameterized point at `t`, clamped to [0,1]: even spacing along the walk matches trail.ts's milestones. */
export function positionAt(curve: Curve<Vector3>, t: number): Vector3 {
  return curve.getPointAt(Math.max(0, Math.min(1, t)))
}

/** Normalized tangent at `t`, clamped away from the exact endpoints where three.js's estimate is least reliable. */
export function tangentAt(curve: Curve<Vector3>, t: number): Vector3 {
  return curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize()
}

const WORLD_UP = new Vector3(0, 1, 0)

/** Horizontal-ish perpendicular (tangent × world-up), scaled by `distance` and flipped by `side`. */
export function perpendicularOffset(curve: Curve<Vector3>, t: number, side: 1 | -1, distance: number): Vector3 {
  const perpendicular = new Vector3().crossVectors(tangentAt(curve, t), WORLD_UP).normalize()
  return perpendicular.multiplyScalar(distance * side)
}

/**
 * Where a side-of-trail marker stands: the perpendicular offset clamped to the walkable run on that side (minus the
 * marker's radius), flipped to the other side when there's under 0.08 of room, y snapped to the ground.
 */
export function groundedOffset(
  curve: Curve<Vector3>, ground: GroundQuery, t: number, side: 1 | -1, distance: number, radius: number,
): { position: Vector3; side: 1 | -1 } {
  const base = positionAt(curve, t)
  const baseY = ground.groundHeightAt(base.x, base.z)
  const room = (s: 1 | -1) => {
    const dir = perpendicularOffset(curve, t, s, 1)
    return { dir, run: ground.walkableRun(base.x, base.z, dir.x, dir.z, baseY, distance + radius) - radius }
  }
  let chosen = side
  let { dir, run } = room(side)
  if (run < MIN_SIDE_ROOM) {
    const other = room(side === 1 ? -1 : 1)
    if (other.run > run) {
      chosen = side === 1 ? -1 : 1
      dir = other.dir
      run = other.run
    }
  }
  const d = Math.max(0, Math.min(distance, run))
  const x = base.x + dir.x * d
  const z = base.z + dir.z * d
  return { position: new Vector3(x, ground.groundHeightAt(x, z), z), side: chosen }
}

/** Flat ribbon over [t0, t1]: a cross-section every ~0.03 of arc, horizontal sides, every vertex on the ground + clearance. */
export function buildTrailRibbon(curve: Curve<Vector3>, ground: GroundQuery, t0: number, t1: number, halfWidth: number): BufferGeometry {
  const from = Math.max(0, Math.min(1, t0))
  const to = Math.max(from, Math.min(1, t1))
  const steps = Math.max(1, Math.ceil((curve.getLength() * (to - from)) / RIBBON_STEP))
  const positions: number[] = []
  const index: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps
    const p = positionAt(curve, t)
    const tangent = tangentAt(curve, t)
    const len = Math.hypot(tangent.x, tangent.z) || 1
    const sx = -tangent.z / len
    const sz = tangent.x / len
    for (const s of [1, -1]) {
      const x = p.x + sx * halfWidth * s
      const z = p.z + sz * halfWidth * s
      positions.push(x, ground.groundHeightAt(x, z) + TRAIL_CLEARANCE, z)
    }
    if (i < steps) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}
