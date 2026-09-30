import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three'
import type { InstancedMesh } from 'three'
import { CONFETTI_DURATION, confettiPiece, confettiPosition, confettiScale } from '../../lib/confetti'

const COUNT = 160
const geometry = new PlaneGeometry(0.14, 0.07)
const material = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false })

/**
 * A burst of confetti from an island's summit when its goal is completed: one instanced mesh, animated for
 * CONFETTI_DURATION seconds, then `onDone`. Asks for its own frames, so it plays under the focused view's demand
 * frameloop too.
 */
export function CompletionBurst({ y, colours, onDone }: { y: number; colours: readonly string[]; onDone: () => void }) {
  const ref = useRef<InstancedMesh>(null)
  const started = useRef<number | null>(null)
  const finished = useRef(false)
  const pieces = useMemo(() => Array.from({ length: COUNT }, (_, i) => confettiPiece(i, colours.length)), [colours.length])
  const dummy = useMemo(() => new Object3D(), [])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const colour = new Color()
    pieces.forEach((piece, i) => mesh.setColorAt(i, colour.set(colours[piece.colour])))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pieces, colours])

  useFrame(({ clock, invalidate }) => {
    const mesh = ref.current
    if (!mesh || finished.current) return
    started.current ??= clock.elapsedTime
    const t = clock.elapsedTime - started.current
    pieces.forEach((piece, i) => {
      const [px, py, pz] = confettiPosition(piece, t)
      dummy.position.set(px, y + py, pz)
      dummy.rotation.set(piece.spin[0] * t, piece.spin[1] * t, piece.spin[2] * t)
      dummy.scale.setScalar(confettiScale(piece, t))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (t >= CONFETTI_DURATION) {
      finished.current = true
      onDone()
      return
    }
    invalidate()
  })

  return <instancedMesh ref={ref} args={[geometry, material, COUNT]} frustumCulled={false} raycast={() => null} />
}
