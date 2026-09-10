// src/features/roadmap/curve.ts
import { CatmullRomCurve3, Vector3 } from 'three'

// 8 control points across 540° of spiral left the Catmull-Rom spline bowing
// ~0.1 units inside the cone's faces between them (chord sag scales with the
// square of the per-segment angle); 24 keeps the spline within the vertical
// SURFACE_CLEARANCE of the true conical surface everywhere.
const CONTROL_POINT_COUNT = 24
const SPIRAL_TURNS = 1.5
const SURFACE_CLEARANCE = 0.05 // sit just above the cone's surface, not on it

/**
 * The trail spirals from the island's base (t=0) up its sloped placeholder-cone
 * surface to the apex (t=1) — spec §1's "summit at 10", built from the same
 * cone geometry Island.tsx already renders (baseRadius/height must match its
 * coneGeometry args). `seed` rotates the spiral's starting angle so different
 * islands don't all wind the same way — pass something derived from the
 * goal's own id/seed, not a shared constant.
 */
export function buildTrailCurve(baseRadius: number, height: number, seed: number): CatmullRomCurve3 {
  const points: Vector3[] = []
  for (let i = 0; i <= CONTROL_POINT_COUNT; i++) {
    const s = i / CONTROL_POINT_COUNT
    const radiusAtS = baseRadius * (1 - s)
    const angle = seed + s * SPIRAL_TURNS * Math.PI * 2
    // three.js centres ConeGeometry on the origin, so the cone Island.tsx
    // renders spans y ∈ [-height/2, height/2] — not [0, height].
    const y = -height / 2 + height * s + SURFACE_CLEARANCE
    points.push(new Vector3(radiusAtS * Math.cos(angle), y, radiusAtS * Math.sin(angle)))
  }
  return new CatmullRomCurve3(points, false, 'catmullrom', 0.5)
}

/** Arc-length-parameterized point at `t` — matches trail.ts's even milestone
 * spacing with even visual spacing along the curve, clamped to [0,1]. */
export function positionAt(curve: CatmullRomCurve3, t: number): Vector3 {
  return curve.getPointAt(Math.max(0, Math.min(1, t)))
}

/** Normalized tangent at `t`, clamped away from the exact endpoints where
 * three.js's tangent estimation is least reliable. */
export function tangentAt(curve: CatmullRomCurve3, t: number): Vector3 {
  return curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize()
}

const WORLD_UP = new Vector3(0, 1, 0)

/**
 * A vector perpendicular to the curve at `t`, in the horizontal-ish plane
 * (crossed against world-up), scaled by `distance` and flipped by `side` —
 * feeds trail.ts's entrySide(index) so entries alternate sides of the trail.
 */
export function perpendicularOffset(
  curve: CatmullRomCurve3,
  t: number,
  side: 1 | -1,
  distance: number,
): Vector3 {
  const tangent = tangentAt(curve, t)
  const perpendicular = new Vector3().crossVectors(tangent, WORLD_UP).normalize()
  return perpendicular.multiplyScalar(distance * side)
}
