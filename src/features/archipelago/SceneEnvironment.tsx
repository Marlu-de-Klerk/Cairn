import { SUN_DIR } from '../../lib/island/orientation'
import { Water } from './Water'
import { Sky } from './Sky'
import { OceanLife } from './OceanLife'
import { HORIZON_COLOR } from './environmentColors'

const SUN_POSITION: [number, number, number] = [SUN_DIR[0] * 20, SUN_DIR[1] * 20, SUN_DIR[2] * 20]

interface SceneEnvironmentProps {
  /** island centres (world x, z); the sea, boats and gulls are arranged around them */
  readonly islands?: readonly (readonly [number, number])[]
}

/** Lights, sky, sea and ocean life shared by the app and the dev harness so the two can't drift apart (spec §2.5, §5.4). */
export function SceneEnvironment({ islands = [] }: SceneEnvironmentProps) {
  const extent = Math.max(12, ...islands.map(([x, z]) => Math.hypot(x, z) + 3))
  return (
    <>
      {/* distant islets and the far sea haze into the horizon; everything near the islands is untouched */}
      <fog attach="fog" args={[HORIZON_COLOR, 90, 340]} />
      <hemisphereLight args={['#EAF6F6', '#6BC2C9', 0.7]} />
      <directionalLight position={SUN_POSITION} intensity={1.15} />
      <Sky />
      <Water extent={extent} islands={islands} />
      <OceanLife extent={extent} islands={islands} />
    </>
  )
}
