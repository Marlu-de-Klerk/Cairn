import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { SHARED_PALETTE } from '../../lib/island/biomes'

const PULSE_SECONDS = 4

export type CairnState = 'pending' | 'next' | 'done'

/**
 * Three stacked stones (0.20 tall, base radius 0.085); the top stone carries the state colour. The "next" cairn pulses
 * for 4 s after it appears, then rests highlighted, so the demand frameloop can go idle (spec Q8, proposed option).
 */
export function MilestoneCairn({ position, state, reducedMotion, onClick }: {
  position: readonly [number, number, number]
  state: CairnState
  reducedMotion: boolean
  onClick: () => void
}) {
  const top = useRef<Mesh>(null)
  const started = useRef<number | null>(null)
  useEffect(() => {
    started.current = null
  }, [state])

  useFrame(({ clock, invalidate }) => {
    if (!top.current) return
    if (state !== 'next' || reducedMotion) {
      top.current.scale.setScalar(1)
      return
    }
    started.current ??= clock.elapsedTime
    const age = clock.elapsedTime - started.current
    if (age > PULSE_SECONDS) {
      top.current.scale.setScalar(1)
      return
    }
    top.current.scale.setScalar(1 + Math.sin(age * 3) * 0.15)
    invalidate()
  })

  const topColor = state === 'done' ? SHARED_PALETTE.cairnDone : state === 'next' ? SHARED_PALETTE.cairnNext : SHARED_PALETTE.cairnPending
  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.04, 0]} scale={[1, 0.55, 1]} raycast={() => null}>
        <dodecahedronGeometry args={[0.085, 0]} />
        <meshLambertMaterial color={SHARED_PALETTE.cairnPending} flatShading />
      </mesh>
      <mesh position={[0, 0.1, 0]} scale={[1, 0.6, 1]} raycast={() => null}>
        <dodecahedronGeometry args={[0.065, 0]} />
        <meshLambertMaterial color={SHARED_PALETTE.cairnPending} flatShading />
      </mesh>
      <mesh ref={top} position={[0, 0.16, 0]} scale={[1, 0.7, 1]} raycast={() => null}>
        <dodecahedronGeometry args={[0.05, 0]} />
        <meshLambertMaterial color={topColor} flatShading />
      </mesh>
      <mesh
        position={[0, 0.1, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
