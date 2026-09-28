import { SUN_DIR } from '../../lib/island/orientation'
import { Water } from './Water'

const SUN_POSITION: [number, number, number] = [SUN_DIR[0] * 20, SUN_DIR[1] * 20, SUN_DIR[2] * 20]

/** Lights and water shared by the app and the dev harness so the two can't drift apart (spec §2.5, §5.4). */
export function SceneEnvironment() {
  return (
    <>
      <hemisphereLight args={['#EAF6F6', '#6BC2C9', 0.7]} />
      <directionalLight position={SUN_POSITION} intensity={1.15} />
      <Water />
    </>
  )
}
