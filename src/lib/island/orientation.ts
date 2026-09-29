import type { Vec3 } from './types'

/** Terraced islands render at this fixed yaw so layout-local +Z (the trailhead side) faces world +X+Z, where the focus camera arrives from. */
export const ISLAND_YAW = Math.PI / 4

const SUN_RAW: Vec3 = [-0.2, 0.8, 0.55]
const SUN_LEN = Math.hypot(...SUN_RAW)
export const SUN_DIR: Vec3 = [SUN_RAW[0] / SUN_LEN, SUN_RAW[1] / SUN_LEN, SUN_RAW[2] / SUN_LEN]

export const CAMERA_DIR_LOCAL: Vec3 = [0, 0, 1]

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

export function localToWorld(v: Vec3): Vec3 {
  return rotateY(v, ISLAND_YAW)
}

export function sunDirLocal(): Vec3 {
  return rotateY(SUN_DIR, -ISLAND_YAW)
}
