import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'
import type { Mesh } from 'three'
import { SUN_DIR } from '../../lib/island/orientation'
import { HORIZON_COLOR, SKY_ZENITH_COLOR, SUN_GLOW_COLOR } from './environmentColors'

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uGlow;
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 color = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, d.y));
    float sun = max(0.0, dot(d, uSun));
    color = mix(color, uGlow, pow(sun, 8.0) * 0.35 + pow(sun, 180.0) * 0.8);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * A gradient sky dome that follows the camera: pale haze at the horizon (the colour the sea fades into), clear blue
 * overhead and a soft glow toward the app's sun. Replaces the page background that used to show past the sea.
 */
export function Sky() {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uHorizon: { value: new Color(HORIZON_COLOR) },
          uZenith: { value: new Color(SKY_ZENITH_COLOR) },
          uGlow: { value: new Color(SUN_GLOW_COLOR) },
          uSun: { value: new Vector3(...SUN_DIR) },
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position)
  })
  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[800, 32, 16]} />
    </mesh>
  )
}
